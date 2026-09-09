"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n";
import styles from "./transit-directory.module.css";
export function TransitSubmissionForm({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/transit/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          description: description.trim(),
        }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 429
            ? en
              ? "Too many requests. Please try again later."
              : "提交过于频繁，请稍后再试。"
            : response.status === 400
              ? en
                ? "Enter a valid website URL and a short introduction."
                : "请输入有效的网站链接和一句话介绍。"
              : en
                ? "Submission failed. Please try again later."
                : "提交失败，请稍后重试。",
        );
        return;
      }
      setUrl("");
      setDescription("");
      setMessage(en ? "Submitted for review." : "已提交，等待审核收录。");
    } catch {
      setMessage(
        en ? "Connection failed. Please try again." : "连接失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>{en ? "Submit a website" : "申请收录"}</h2>
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
          disabled={pending}
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
            disabled={pending}
            style={{ width: "100%" }}
          />
        </div>
        <button type="submit" disabled={pending}>
          {pending
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
