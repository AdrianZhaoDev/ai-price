"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, X } from "lucide-react";
import { trackTrafficEvent } from "@/lib/analytics/traffic";
import { getMessages, type Locale } from "@/lib/i18n";
import type { PriceMode } from "@/lib/pricing/types";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type SubscriptionSheetProps = {
  locale?: Locale;
  open: boolean;
  scopeLabel: string;
  providerId: string;
  mode: PriceMode;
  planId?: string;
  subscriptionType?: "price" | "api_model_new";
  onClose: () => void;
};

type SubmitState =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  | "fallback_confirm"
  | "fallback_submitting";
type SubscriptionResultStatus = "subscribed" | "already_subscribed";
type SubscriptionFailureKind =
  "http" | "network" | "invalid_response" | "fallback_available";

class SubscriptionRequestError extends Error {
  constructor(
    readonly failureKind: Exclude<
      SubscriptionFailureKind,
      "fallback_available"
    >,
    message: string,
  ) {
    super(message);
  }
}

function failureKind(error: unknown): SubscriptionFailureKind {
  return error instanceof SubscriptionRequestError
    ? error.failureKind
    : "invalid_response";
}

export function SubscriptionSheet({
  locale = "zh-CN",
  open,
  scopeLabel,
  providerId,
  mode,
  planId,
  subscriptionType = "price",
  onClose,
}: SubscriptionSheetProps) {
  const messages = getMessages(locale);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [resultStatus, setResultStatus] =
    useState<SubscriptionResultStatus>("subscribed");
  const [email, setEmail] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const fallbackConfirmRef = useRef<HTMLButtonElement>(null);
  const lastSuccessfulSubscriptionRef = useRef("");

  const closeSheet = useCallback(() => {
    setState("idle");
    setMessage("");
    setResultStatus("subscribed");
    setEmail("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      emailRef.current?.focus(),
    );

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSheet();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hidden);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [closeSheet, open]);

  useEffect(() => {
    if (!open || state !== "fallback_confirm") return;
    const frame = window.requestAnimationFrame(() =>
      fallbackConfirmRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, state]);

  async function submitRequest(payload: Record<string, unknown>): Promise<{
    ok: boolean;
    message?: string;
    status?: SubscriptionResultStatus;
    code?: string;
    rankingFallbackAllowed?: boolean;
  }> {
    let response: Response;
    try {
      response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale }),
      });
    } catch {
      throw new SubscriptionRequestError(
        "network",
        messages.subscription.networkError,
      );
    }

    let result: {
      message?: string;
      status?: unknown;
      code?: string;
      rankingFallbackAllowed?: boolean;
    };
    try {
      result = (await response.json()) as typeof result;
    } catch {
      throw new SubscriptionRequestError(
        "invalid_response",
        messages.subscription.invalidResponse,
      );
    }
    const status: SubscriptionResultStatus | undefined =
      result.status === "subscribed" || result.status === "already_subscribed"
        ? result.status
        : undefined;
    return { ok: response.ok, ...result, status };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    setResultStatus("subscribed");

    const normalizedEmail = email.trim().toLowerCase();
    const subscriptionKey = `${normalizedEmail}:${subscriptionType}:${providerId}:${planId || "*"}`;
    if (lastSuccessfulSubscriptionRef.current === subscriptionKey) {
      setState("success");
      setMessage(messages.subscription.alreadySubmitted);
      setResultStatus("already_subscribed");
      return;
    }

    const payload =
      subscriptionType === "api_model_new"
        ? {
            subscriptionType: "api_model_new",
            email: normalizedEmail,
            rankingFallback: false,
          }
        : {
            subscriptionType: "price",
            email: normalizedEmail,
            providerId,
            planId: planId || null,
          };

    try {
      const result = await submitRequest(payload);
      if (
        !result.ok &&
        result.code === "subscription_limit" &&
        result.rankingFallbackAllowed
      ) {
        trackTrafficEvent("subscription_submit_failed", {
          mode,
          provider_id: providerId,
          subscription_type: subscriptionType,
          plan_scope:
            subscriptionType === "api_model_new"
              ? "api_model_new"
              : planId
                ? "plan"
                : "provider",
          failure_kind: "fallback_available",
        });
        setState("fallback_confirm");
        setMessage(result.message ?? "");
        return;
      }
      if (!result.ok) {
        throw new SubscriptionRequestError(
          "http",
          result.message || messages.subscription.createError,
        );
      }

      setState("success");
      setMessage(result.message || messages.subscription.success);
      setResultStatus("subscribed");
      lastSuccessfulSubscriptionRef.current = subscriptionKey;
      trackTrafficEvent("subscription_submit_succeeded", {
        mode,
        provider_id: providerId,
        subscription_type: subscriptionType,
        plan_scope:
          subscriptionType === "api_model_new"
            ? "api_model_new"
            : planId
              ? "plan"
              : "provider",
        result: result.status ?? "subscribed",
      });
    } catch (error) {
      trackTrafficEvent("subscription_submit_failed", {
        mode,
        provider_id: providerId,
        subscription_type: subscriptionType,
        plan_scope:
          subscriptionType === "api_model_new"
            ? "api_model_new"
            : planId
              ? "plan"
              : "provider",
        failure_kind: failureKind(error),
      });
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : messages.subscription.createError,
      );
    }
  }

  async function confirmRankingFallback() {
    setState("fallback_submitting");
    setMessage("");
    try {
      const result = await submitRequest({
        subscriptionType: "api_model_new",
        email: email.trim().toLowerCase(),
        rankingFallback: true,
      });
      if (!result.ok) {
        throw new SubscriptionRequestError(
          "http",
          result.message || messages.subscription.createError,
        );
      }
      setState("success");
      setMessage(result.message || messages.subscription.success);
      setResultStatus("subscribed");
      lastSuccessfulSubscriptionRef.current = `${email.trim().toLowerCase()}:api_model_new:api-model-new:*`;
      trackTrafficEvent("subscription_submit_succeeded", {
        mode,
        provider_id: providerId,
        subscription_type: "api_model_new",
        plan_scope: "api_model_new",
        result: "fallback_subscribed",
      });
    } catch (error) {
      trackTrafficEvent("subscription_submit_failed", {
        mode,
        provider_id: providerId,
        subscription_type: "api_model_new",
        plan_scope: "api_model_new",
        failure_kind: failureKind(error),
      });
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : messages.subscription.createError,
      );
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="sheet-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <motion.div
            ref={dialogRef}
            className="subscription-sheet"
            initial={{ y: 36, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", bounce: 0, duration: 0.32 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-title"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <div className="sheet-icon" aria-hidden="true">
                <Bell size={19} />
              </div>
              <button
                type="button"
                className="icon-button pressable"
                onClick={closeSheet}
                aria-label={messages.subscription.closeLabel}
              >
                <X size={19} />
              </button>
            </div>

            {state === "success" ? (
              <div className="sheet-success" role="status">
                <div className="success-mark" aria-hidden="true">
                  <Check size={22} />
                </div>
                <h2 id="subscription-title">{message}</h2>
                <p>
                  {resultStatus === "already_subscribed"
                    ? subscriptionType === "api_model_new"
                      ? messages.subscription.alreadySubscribedModel
                      : messages.subscription.alreadySubscribedPrice
                    : messages.subscription.backgroundDelivery}
                </p>
                <button
                  type="button"
                  className="primary-button pressable"
                  onClick={closeSheet}
                >
                  {messages.subscription.done}
                </button>
              </div>
            ) : state === "fallback_confirm" ||
              state === "fallback_submitting" ? (
              <div className="sheet-fallback-confirm">
                <p className="eyebrow">
                  {messages.subscription.fallbackEyebrow}
                </p>
                <h2 id="subscription-title">
                  {messages.subscription.fallbackTitle}
                </h2>
                <p>{messages.subscription.fallbackDescription}</p>
                <div className="sheet-confirm-actions">
                  <button
                    ref={fallbackConfirmRef}
                    type="button"
                    className="primary-button pressable"
                    disabled={state === "fallback_submitting"}
                    onClick={() => void confirmRankingFallback()}
                  >
                    {state === "fallback_submitting"
                      ? messages.subscription.subscribing
                      : messages.subscription.confirmNewModel}
                  </button>
                  <button
                    type="button"
                    className="secondary-button pressable"
                    disabled={state === "fallback_submitting"}
                    onClick={closeSheet}
                  >
                    {messages.subscription.notNow}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="sheet-copy">
                  <p className="eyebrow">
                    {subscriptionType === "api_model_new"
                      ? messages.subscription.newModelNotice
                      : messages.subscription.priceNotice}
                  </p>
                  <h2 id="subscription-title">
                    {subscriptionType === "api_model_new"
                      ? messages.subscription.subscribeNewModel
                      : messages.subscription.followScope(scopeLabel)}
                  </h2>
                  <p>
                    {subscriptionType === "api_model_new"
                      ? messages.subscription.newModelDescription
                      : messages.subscription.priceDescription}
                  </p>
                </div>

                <form onSubmit={onSubmit} className="subscription-form">
                  <label htmlFor="price-email">
                    {messages.subscription.email}
                  </label>
                  <input
                    ref={emailRef}
                    id="price-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={messages.subscription.emailPlaceholder}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    aria-describedby={
                      state === "error" ? "subscription-error" : undefined
                    }
                  />
                  {state === "error" ? (
                    <p
                      id="subscription-error"
                      className="form-error"
                      role="alert"
                    >
                      {message}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="primary-button pressable"
                    disabled={state === "submitting"}
                  >
                    {state === "submitting"
                      ? messages.subscription.subscribing
                      : messages.subscription.subscribeNow}
                  </button>
                  <p className="form-note">
                    {messages.subscription.unsubscribeNote}
                  </p>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
