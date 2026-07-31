"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type SubscriptionSheetProps = {
  open: boolean;
  scopeLabel: string;
  providerId: string;
  planId?: string;
  onClose: () => void;
};

type SubmitState = "idle" | "submitting" | "success" | "error";
type SubscriptionResultStatus = "subscribed" | "already_subscribed";

export function SubscriptionSheet({
  open,
  scopeLabel,
  providerId,
  planId,
  onClose,
}: SubscriptionSheetProps) {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [resultStatus, setResultStatus] =
    useState<SubscriptionResultStatus>("subscribed");
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const closeSheet = useCallback(() => {
    setState("idle");
    setMessage("");
    setResultStatus("subscribed");
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    setResultStatus("subscribed");

    const form = new FormData(event.currentTarget);
    const payload = {
      email: form.get("email"),
      providerId,
      planId: planId || null,
    };

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        message?: string;
        status?: SubscriptionResultStatus;
      };

      if (!response.ok) {
        throw new Error(result.message || "暂时无法创建订阅，请稍后重试。");
      }

      setState("success");
      setMessage(result.message || "您已订阅成功！");
      setResultStatus(result.status ?? "subscribed");
    } catch (error) {
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
            ) : (
              <>
                <div className="sheet-copy">
                  <p className="eyebrow">价格变动通知</p>
                  <h2 id="subscription-title">关注 {scopeLabel}</h2>
                  <p>提交后立即生效，仅在价格或套餐发生变化时发送邮件。</p>
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
