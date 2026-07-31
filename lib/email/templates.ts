type SubscriptionCreatedTemplateInput = {
  scopeLabel: string;
  unsubscribeUrl: string;
};

type PriceChangeTemplateInput = {
  scopeLabel: string;
  changes: Array<{
    region: string;
    previousPrice: string;
    currentPrice: string;
    previousCny: number | null;
    currentCny: number | null;
  }>;
  topThree: Array<{
    rank: number;
    region: string;
    displayPrice: string;
    convertedCny: number;
    sourceUrl: string;
  }>;
  unsubscribeUrl: string;
};

type AdminAlertTemplateInput = {
  sourceName: string;
  errorCode: string;
  message: string;
  occurredAt: string;
  adminUrl?: string;
};

function shell(content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f6f5f2;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:22px;">AI 价签</div>
      <div style="background:#fff;border:1px solid rgba(60,60,67,.14);border-radius:22px;padding:28px;">
        ${content}
      </div>
      <p style="margin:18px 4px 0;color:#6e6e73;font-size:11px;line-height:1.6;">价格仅供参考，实际价格以官方页面为准。</p>
    </div>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? escapeHtml(url.toString())
      : "#";
  } catch {
    return "#";
  }
}

export function subscriptionCreatedEmail({
  scopeLabel,
  unsubscribeUrl,
}: SubscriptionCreatedTemplateInput) {
  const safeScopeLabel = escapeHtml(scopeLabel);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const html = shell(`
    <p style="margin:0;color:#0066cc;font-size:12px;font-weight:700;">价格关注已生效</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">已关注 ${safeScopeLabel}</h1>
    <p style="margin:0;color:#5f5f65;font-size:14px;line-height:1.7;">订阅已经成功。之后仅在价格或套餐发生变化时通知你，无需再点击确认。</p>
    <p style="margin:22px 0 0;color:#85858c;font-size:11px;line-height:1.6;">不再需要这项通知？<a href="${safeUnsubscribeUrl}" style="color:#0066cc;">取消订阅</a></p>
  `);

  return {
    subject: `已成功关注 ${scopeLabel} 的价格`,
    html,
    text: `您已成功关注 ${scopeLabel} 的价格。价格或套餐发生变化时，我们会发送邮件。\n\n取消订阅：${unsubscribeUrl}`,
  };
}

export function priceChangeEmail({
  scopeLabel,
  changes,
  topThree,
  unsubscribeUrl,
}: PriceChangeTemplateInput) {
  const safeScopeLabel = escapeHtml(scopeLabel);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const rankColors = ["#13d86f", "#2485ff", "#8a5cff"];
  const changeRows = changes
    .map(
      (change) => `
      <tr>
        <td style="padding:9px 0;color:#5f5f65;font-size:12px;">${escapeHtml(change.region)}</td>
        <td style="padding:9px 0;color:#85858c;font-size:12px;text-decoration:line-through;">${escapeHtml(change.previousPrice)}${change.previousCny === null ? "" : ` · ¥${change.previousCny.toFixed(2)}`}</td>
        <td style="padding:9px 0;text-align:right;font-size:12px;font-weight:700;">${escapeHtml(change.currentPrice)}${change.currentCny === null ? "" : ` · ¥${change.currentCny.toFixed(2)}`}</td>
      </tr>`,
    )
    .join("");
  const topRows = topThree
    .map((entry, index) => {
      const color = rankColors[index] ?? "#0066cc";
      return `
      <tr>
        <td style="padding:10px 0;">
          <span style="display:inline-block;min-width:24px;color:${color};font-size:12px;font-weight:800;">#${entry.rank}</span>
          <span style="font-size:13px;font-weight:650;">${escapeHtml(entry.region)}</span>
        </td>
        <td style="padding:10px 0;color:#5f5f65;font-size:12px;">${escapeHtml(entry.displayPrice)}</td>
        <td style="padding:10px 0;text-align:right;color:${color};font-size:17px;font-weight:800;">¥${entry.convertedCny.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
  const safeSourceUrl = safeHttpUrl(topThree[0]?.sourceUrl ?? "");
  const html = shell(`
    <p style="margin:0;color:#13a75b;font-size:12px;font-weight:700;">最低人民币价格发生变化</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">${safeScopeLabel}</h1>
    <p style="margin:0 0 14px;color:#5f5f65;font-size:13px;line-height:1.6;">以下变动影响了当前或上一轮人民币最低三档。</p>
    <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e5e5e7;">${changeRows}</table>
    <p style="margin:22px 0 6px;color:#85858c;font-size:12px;font-weight:700;">当前最低三档</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">${topRows}</table>
    <a href="${safeSourceUrl}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#0066cc;color:white;text-decoration:none;font-size:14px;font-weight:650;">查看官方页面</a>
    <p style="margin:22px 0 0;color:#85858c;font-size:11px;"><a href="${safeUnsubscribeUrl}" style="color:#0066cc;">退订此价格通知</a></p>
  `);
  const changeText = changes
    .map(
      (change) =>
        `${change.region}: ${change.previousPrice}${change.previousCny === null ? "" : ` (¥${change.previousCny.toFixed(2)})`} → ${change.currentPrice}${change.currentCny === null ? "" : ` (¥${change.currentCny.toFixed(2)})`}`,
    )
    .join("\n");
  const rankText = topThree
    .map(
      (entry) =>
        `#${entry.rank} ${entry.region}: ${entry.displayPrice} ≈ ¥${entry.convertedCny.toFixed(2)}`,
    )
    .join("\n");

  return {
    subject: `${scopeLabel} 人民币最低三档发生变化`,
    html,
    text: `${scopeLabel}\n\n价格变动：\n${changeText}\n\n当前最低三档：\n${rankText}\n\n官方页面：${topThree[0]?.sourceUrl ?? ""}\n退订：${unsubscribeUrl}`,
  };
}

export function adminAlertEmail({
  sourceName,
  errorCode,
  message,
  occurredAt,
  adminUrl,
}: AdminAlertTemplateInput) {
  const safeSourceName = escapeHtml(sourceName);
  const safeErrorCode = escapeHtml(errorCode);
  const safeMessage = escapeHtml(message);
  const safeOccurredAt = escapeHtml(occurredAt);
  const safeAdminUrl = adminUrl ? safeHttpUrl(adminUrl) : null;
  const html = shell(`
    <p style="margin:0;color:#c9342f;font-size:12px;font-weight:700;">采集异常</p>
    <h1 style="margin:10px 0 16px;font-size:23px;">${safeSourceName}</h1>
    <p style="margin:0 0 8px;font-size:13px;"><strong>错误码：</strong>${safeErrorCode}</p>
    <p style="margin:0 0 8px;font-size:13px;"><strong>时间：</strong>${safeOccurredAt}</p>
    <pre style="margin:16px 0 0;padding:14px;border-radius:12px;background:#f2f2f4;color:#3a3a3c;white-space:pre-wrap;font-size:12px;">${safeMessage}</pre>
    ${
      safeAdminUrl
        ? `<p style="margin:18px 0 0;"><a href="${safeAdminUrl}" style="color:#0066cc;font-size:13px;font-weight:700;">在管理后台查看完整错误日志 →</a></p>`
        : ""
    }
  `);

  return {
    subject: `[AI 价签] ${sourceName} 采集异常`,
    html,
    text: `${sourceName} 采集异常\n${errorCode}\n${occurredAt}\n${message}${adminUrl ? `\n完整日志：${adminUrl}` : ""}`,
  };
}
