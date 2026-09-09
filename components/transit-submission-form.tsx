"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./transit-directory.module.css";
export function TransitSubmissionForm({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const [email, setEmail] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<"code" | "verify" | "submit" | null>(
    null,
  );
  const [message, setMessage] = useState("");

  async function sendCode() {
    if (pending || !email.trim()) return;
    setPending("code");
    setMessage("");
    setVerified(false);
    setVerificationId("");
    try {
      const response = await fetch("/api/transit/submissions/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        verificationId?: string;
      };
      if (!response.ok || !result.verificationId) {
        setMessage(
          response.status === 429
            ? en
              ? "Too many verification requests. Please try again later."
              : "验证码发送过于频繁，请稍后再试。"
            : response.status === 400
              ? en
                ? "Enter a valid email address."
                : "请输入有效邮箱。"
              : en
                ? "Could not send the code. Please try again later."
                : "验证码发送失败，请稍后重试。",
        );
        return;
      }
      setVerificationId(result.verificationId);
      setCode("");
      setMessage(
        en
          ? "Verification code sent. It is valid for 10 minutes."
          : "验证码已发送，10 分钟内有效。",
      );
    } catch {
      setMessage(
        en ? "Connection failed. Please try again." : "连接失败，请重试。",
      );
    } finally {
      setPending(null);
    }
  }

  async function verifyCode() {
    if (pending || !verificationId || !/^\d{6}$/.test(code.trim())) return;
    setPending("verify");
    setMessage("");
    try {
      const response = await fetch("/api/transit/submissions/verification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          verificationId,
          code: code.trim(),
        }),
      });
      if (!response.ok) {
        setMessage(
          en
            ? "The code is incorrect or expired. Request a new code if needed."
            : "验证码错误或已过期，需要时请重新获取。",
        );
        return;
      }
      setVerified(true);
      setMessage(en ? "Email verified." : "邮箱验证成功。");
    } catch {
      setMessage(
        en ? "Connection failed. Please try again." : "连接失败，请重试。",
      );
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !verified || !verificationId) return;
    setPending("submit");
    setMessage("");
    try {
      const response = await fetch("/api/transit/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          verificationId,
          url: url.trim(),
          description: description.trim(),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        code?: string;
        contact?: string;
      };
      if (response.ok && result.code === "duplicate") {
        const contact = result.contact
          ? en
            ? `, or contact ${result.contact}`
            : `，或联系 ${result.contact}`
          : "";
        setMessage(
          en
            ? `This website has already been submitted. If it is not visible yet, please wait patiently${contact}.`
            : `该网站已有提交。若尚未显示，请耐心等待${contact}。`,
        );
        return;
      }
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? en
              ? "Too many requests. Please try again later."
              : "提交过于频繁，请稍后再试。"
            : response.status === 400
              ? en
                ? "Check the website details and verify your email again."
                : "请检查网站信息，并重新验证邮箱。"
              : en
                ? "Submission failed. Please try again later."
                : "提交失败，请稍后重试。",
        );
        return;
      }
      setEmail("");
      setVerificationId("");
      setCode("");
      setVerified(false);
      setUrl("");
      setDescription("");
      setMessage(en ? "Submitted for review." : "已提交，等待审核收录。");
    } catch {
      setMessage(
        en ? "Connection failed. Please try again." : "连接失败，请重试。",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>{en ? "Submit a website" : "申请收录"}</h2>
      <div className={styles.controls}>
        <div>
          <label htmlFor="transit-submission-email">
            {en ? "Email" : "邮箱"}
          </label>
          <div className={styles.inlineControls}>
            <input
              id="transit-submission-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setVerificationId("");
                setCode("");
                setVerified(false);
              }}
              disabled={Boolean(pending) || verified}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={Boolean(pending) || verified || !email.trim()}
            >
              {pending === "code"
                ? en
                  ? "Sending…"
                  : "发送中…"
                : en
                  ? "Send code"
                  : "发送验证码"}
            </button>
          </div>
        </div>
        {verificationId ? (
          <div>
            <label htmlFor="transit-submission-code">
              {en ? "Verification code" : "邮箱验证码"}
            </label>
            <div className={styles.inlineControls}>
              <input
                id="transit-submission-code"
                name="code"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={Boolean(pending) || verified}
              />
              <button
                type="button"
                onClick={verifyCode}
                disabled={Boolean(pending) || verified || code.length !== 6}
              >
                {verified
                  ? en
                    ? "Verified"
                    : "已验证"
                  : pending === "verify"
                    ? en
                      ? "Verifying…"
                      : "验证中…"
                    : en
                      ? "Verify"
                      : "验证邮箱"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <label htmlFor="transit-submission-url">
        {en ? "Website link" : "网站链接"}
      </label>
      <div className={styles.controls}>
        <input
          id="transit-submission-url"
          name="url"
          type="url"
          required
          maxLength={2048}
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={Boolean(pending) || !verified}
        />
        <div>
          <label htmlFor="transit-submission-description">
            {en ? "One-sentence introduction" : "一句话介绍"}
          </label>
          <input
            id="transit-submission-description"
            name="description"
            type="text"
            required
            maxLength={160}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={Boolean(pending) || !verified}
            style={{ width: "100%" }}
          />
        </div>
        <button type="submit" disabled={Boolean(pending) || !verified}>
          {pending === "submit"
            ? en
              ? "Submitting…"
              : "提交中…"
            : en
              ? "Submit"
              : "提交申请"}
        </button>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
