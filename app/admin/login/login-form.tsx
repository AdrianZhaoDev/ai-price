"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function requestCode() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? "发送失败。");
      return;
    }
    setStage("verify");
    setMessage("验证码已发送到管理员邮箱，10 分钟内有效。");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage(result.error ?? "验证失败。");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="admin-login-panel">
      <div className="admin-login-mark" aria-hidden="true">
        A
      </div>
      <p className="admin-eyebrow">Low Price Radar · 管理入口</p>
      <h1>订阅通知管理</h1>
      <p className="admin-login-copy">
        登录验证码只发送到服务器配置的管理员邮箱。
      </p>

      {stage === "request" ? (
        <button
          className="primary-button admin-login-action"
          type="button"
          disabled={pending}
          onClick={requestCode}
        >
          {pending ? "正在发送…" : "发送登录验证码"}
        </button>
      ) : (
        <form className="admin-code-form" onSubmit={verifyCode}>
          <label htmlFor="admin-code">6 位验证码</label>
          <input
            id="admin-code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
          />
          <button
            className="primary-button"
            type="submit"
            disabled={pending || code.length !== 6}
          >
            {pending ? "正在验证…" : "进入管理页"}
          </button>
          <button
            className="admin-text-button"
            type="button"
            disabled={pending}
            onClick={requestCode}
          >
            重新发送
          </button>
        </form>
      )}
      <p className="admin-form-message" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
