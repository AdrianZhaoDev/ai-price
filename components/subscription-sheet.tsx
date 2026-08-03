"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, X } from "lucide-react";
import { trackTrafficEvent } from "@/lib/analytics/traffic";
import type { PriceMode } from "@/lib/pricing/types";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type SubscriptionSheetProps = {
  open: boolean;
  scopeLabel: string;
  providerId: string;
  mode: PriceMode;
  planId?: string;
  subscriptionType?: "price" | "api_ranking";
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
  open,
  scopeLabel,
  providerId,
  mode,
  planId,
  subscriptionType = "price",
  onClose,
}: SubscriptionSheetProps) {
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
        body: JSON.stringify(payload),
      });
    } catch {
      throw new SubscriptionRequestError(
        "network",
        "网络连接失败，请稍后重试。",
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
        "服务响应异常，请稍后重试。",
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
      setMessage("您已订阅，请勿重复订阅。");
      setResultStatus("already_subscribed");
      return;
    }

    const payload =
      subscriptionType === "api_ranking"
        ? {
            subscriptionType: "api_ranking",
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
            subscriptionType === "api_ranking"
              ? "api_ranking"
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
          result.message || "暂时无法创建订阅，请稍后重试。",
        );
      }

      setState("success");
      setMessage(result.message || "您已订阅成功！");
      setResultStatus("subscribed");
      lastSuccessfulSubscriptionRef.current = subscriptionKey;
      trackTrafficEvent("subscription_submit_succeeded", {
        mode,
        provider_id: providerId,
        subscription_type: subscriptionType,
        plan_scope:
          subscriptionType === "api_ranking"
            ? "api_ranking"
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
          subscriptionType === "api_ranking"
            ? "api_ranking"
            : planId
              ? "plan"
              : "provider",
        failure_kind: failureKind(error),
      });
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "暂时无法创建订阅，请稍后重试。",
      );
    }
  }

  async function confirmRankingFallback() {
    setState("fallback_submitting");
    setMessage("");
    try {
      const result = await submitRequest({
        subscriptionType: "api_ranking",
        email: email.trim().toLowerCase(),
        rankingFallback: true,
      });
      if (!result.ok) {
        throw new SubscriptionRequestError(
          "http",
          result.message || "暂时无法创建订阅，请稍后重试。",
        );
      }
      setState("success");
      setMessage(result.message || "您已订阅成功！");
      setResultStatus("subscribed");
      lastSuccessfulSubscriptionRef.current = `${email.trim().toLowerCase()}:api_ranking:api-ranking:*`;
      trackTrafficEvent("subscription_submit_succeeded", {
        mode,
        provider_id: providerId,
        subscription_type: "api_ranking",
        plan_scope: "api_ranking",
        result: "fallback_subscribed",
      });
    } catch (error) {
      trackTrafficEvent("subscription_submit_failed", {
        mode,
        provider_id: providerId,
        subscription_type: "api_ranking",
        plan_scope: "api_ranking",
        failure_kind: failureKind(error),
      });
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "暂时无法创建订阅，请稍后重试。",
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
                aria-label="关闭价格订阅"
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
                    ? "无需再次提交；价格或套餐变化时我们会发送邮件。"
                    : "订阅成功通知邮件将在后台发送，无需点击确认。"}
                </p>
                <button
                  type="button"
                  className="primary-button pressable"
                  onClick={closeSheet}
                >
                  完成
                </button>
              </div>
            ) : state === "fallback_confirm" ||
              state === "fallback_submitting" ? (
              <div className="sheet-fallback-confirm">
                <p className="eyebrow">一次掌握全部变化</p>
                <h2 id="subscription-title">订阅次数有点多</h2>
                <p>
                  您近期提交了较多订阅。要不要改为一次订阅 API
                  价格排行榜？之后缓存输入、非缓存输入和输出价格有变化时，我们都会通知您。
                </p>
                <div className="sheet-confirm-actions">
                  <button
                    ref={fallbackConfirmRef}
                    type="button"
                    className="primary-button pressable"
                    disabled={state === "fallback_submitting"}
                    onClick={() => void confirmRankingFallback()}
                  >
                    {state === "fallback_submitting"
                      ? "正在订阅…"
                      : "确认订阅排行榜"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button pressable"
                    disabled={state === "fallback_submitting"}
                    onClick={closeSheet}
                  >
                    暂不订阅
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="sheet-copy">
                  <p className="eyebrow">
                    {subscriptionType === "api_ranking"
                      ? "排行榜变动通知"
                      : "价格变动通知"}
                  </p>
                  <h2 id="subscription-title">
                    {subscriptionType === "api_ranking"
                      ? "订阅 API 价格排行榜"
                      : `关注 ${scopeLabel}`}
                  </h2>
                  <p>
                    {subscriptionType === "api_ranking"
                      ? "缓存输入、非缓存输入或输出榜发生变化时，我们会发送一封汇总邮件。"
                      : "提交后立即生效，仅在价格或套餐发生变化时发送邮件。"}
                  </p>
                </div>

                <form onSubmit={onSubmit} className="subscription-form">
                  <label htmlFor="price-email">邮箱</label>
                  <input
                    ref={emailRef}
                    id="price-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
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
                    {state === "submitting" ? "正在订阅…" : "立即订阅"}
                  </button>
                  <p className="form-note">
                    可随时退订，我们不会发送营销邮件。
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
