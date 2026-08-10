type SubscriptionCreatedTemplateInput = {
  scopeLabel: string;
  viewUrl: string;
  ctaLabel: string;
  unsubscribeUrl: string;
  eyebrow?: string;
  description?: string;
  subject?: string;
};

type PriceChangeTemplateInput = {
  scopeLabel: string;
  changes: Array<{
    region: string;
    previousPrice: string;
    currentPrice: string;
    previousCny: number | null;
    currentCny: number | null;
    changePercent: number | null;
  }>;
  topThree: Array<{
    rank: number;
    region: string;
    displayPrice: string;
    convertedCny: number;
    sourceUrl: string;
  }>;
  viewUrl: string;
  ctaLabel: string;
  unsubscribeUrl: string;
};

export type ApiRankingEmailTable = {
  metric: "cached_input" | "input" | "output";
  label: string;
  rows: Array<{
    rank: number;
    providerName: string;
    modelName: string;
    displayPrice: string;
    priceCny: number;
    previousRank: number | null;
    previousDisplayPrice: string | null;
    rankDelta: number | null;
    priceDirection: "increase" | "decrease" | null;
    isNew: boolean;
  }>;
};

type ApiRankingChangeTemplateInput = {
  subject: string;
  tables: ApiRankingEmailTable[];
  removed?: Array<{
    metricLabel: string;
    providerName: string;
    modelName: string;
    previousRank: number | null;
    previousDisplayPrice: string | null;
  }>;
  viewUrl: string;
  unsubscribeUrl: string;
};

type AdminAlertTemplateInput = {
  sourceName: string;
  errorCode: string;
  message: string;
  occurredAt: string;
  adminUrl?: string;
};

type ModelCatalogDigestTemplateInput = {
  models: Array<{
    name: string;
    labName: string;
    releaseDate: string;
    url: string;
  }>;
  catalogVersion: string;
  viewUrl: string;
  unsubscribeUrl: string;
};

function shell(content: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f6f5f2;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:22px;">Low Price Radar</div>
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

function safeHttpTextUrl(value: string): string {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function safeHttpUrl(value: string): string {
  return escapeHtml(safeHttpTextUrl(value));
}

export function subscriptionCreatedEmail({
  scopeLabel,
  viewUrl,
  ctaLabel,
  unsubscribeUrl,
  eyebrow = "价格关注已生效",
  description = "订阅已经成功。之后仅在价格或套餐发生变化时通知你，无需再点击确认。",
  subject,
}: SubscriptionCreatedTemplateInput) {
  const safeScopeLabel = escapeHtml(scopeLabel);
  const safeViewUrl = safeHttpUrl(viewUrl);
  const safeViewTextUrl = safeHttpTextUrl(viewUrl);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const safeUnsubscribeTextUrl = safeHttpTextUrl(unsubscribeUrl);
  const html = shell(`
    <p style="margin:0;color:#0066cc;font-size:12px;font-weight:700;">${escapeHtml(eyebrow)}</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">已关注 ${safeScopeLabel}</h1>
    <p style="margin:0;color:#5f5f65;font-size:14px;line-height:1.7;">${escapeHtml(description)}</p>
    <p style="margin:24px 0 0;"><a href="${safeViewUrl}" style="display:inline-block;padding:13px 19px;border-radius:12px;background:#0066cc;color:white;text-decoration:none;font-size:14px;font-weight:700;">${safeCtaLabel}</a></p>
    <p style="margin:22px 0 0;color:#85858c;font-size:11px;line-height:1.6;">不再需要这项通知？<a href="${safeUnsubscribeUrl}" style="color:#0066cc;">取消订阅</a></p>
  `);

  return {
    subject: subject ?? `已订阅成功｜看看 ${scopeLabel} 的当前价格`,
    html,
    text: `您已成功关注 ${scopeLabel}。${description}\n\n${ctaLabel}：${safeViewTextUrl}\n取消订阅：${safeUnsubscribeTextUrl}`,
  };
}

export function priceChangeEmail({
  scopeLabel,
  changes,
  topThree,
  viewUrl,
  ctaLabel,
  unsubscribeUrl,
}: PriceChangeTemplateInput) {
  const safeScopeLabel = escapeHtml(scopeLabel);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const safeUnsubscribeTextUrl = safeHttpTextUrl(unsubscribeUrl);
  const safeViewUrl = safeHttpUrl(viewUrl);
  const safeViewTextUrl = safeHttpTextUrl(viewUrl);
  const safeCtaLabel = escapeHtml(ctaLabel);
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
  const primaryDecrease = changes
    .filter((change) => (change.changePercent ?? 0) < 0)
    .sort(
      (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )[0];
  const primaryIncrease = changes
    .filter((change) => (change.changePercent ?? 0) > 0)
    .sort(
      (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
    )[0];
  const subject = primaryDecrease
    ? `${scopeLabel} 更便宜了！`
    : primaryIncrease
      ? `${scopeLabel} 涨价了！`
      : `${scopeLabel} 价格有变化`;
  const html = shell(`
    <p style="margin:0;color:#13a75b;font-size:12px;font-weight:700;">最低人民币价格发生变化</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">${safeScopeLabel}</h1>
    <p style="margin:0 0 14px;color:#5f5f65;font-size:13px;line-height:1.6;">以下变动影响了当前或上一轮人民币最低三档。</p>
    <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e5e5e7;">${changeRows}</table>
    <p style="margin:22px 0 6px;color:#85858c;font-size:12px;font-weight:700;">当前最低三档</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">${topRows}</table>
    <a href="${safeViewUrl}" style="display:inline-block;padding:13px 19px;border-radius:12px;background:#0066cc;color:white;text-decoration:none;font-size:14px;font-weight:700;">${safeCtaLabel}</a>
    ${topThree[0]?.sourceUrl ? `<p style="margin:14px 0 0;font-size:11px;"><a href="${safeHttpUrl(topThree[0].sourceUrl)}" style="color:#5f5f65;">查看官方来源</a></p>` : ""}
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
    subject,
    html,
    text: `${scopeLabel}\n\n价格变动：\n${changeText}\n\n当前最低三档：\n${rankText}\n\n${ctaLabel}：${safeViewTextUrl}\n官方来源：${topThree[0]?.sourceUrl ? safeHttpTextUrl(topThree[0].sourceUrl) : ""}\n退订：${safeUnsubscribeTextUrl}`,
  };
}

export function apiRankingChangeEmail({
  subject,
  tables,
  removed = [],
  viewUrl,
  unsubscribeUrl,
}: ApiRankingChangeTemplateInput) {
  const safeViewUrl = safeHttpUrl(viewUrl);
  const safeViewTextUrl = safeHttpTextUrl(viewUrl);
  const safeUnsubscribeUrl = safeHttpUrl(unsubscribeUrl);
  const safeUnsubscribeTextUrl = safeHttpTextUrl(unsubscribeUrl);
  const tableHtml = tables
    .map((table) => {
      const rows = table.rows
        .map((row) => {
          const rankBadge = row.isNew
            ? "新"
            : row.rankDelta && row.rankDelta > 0
              ? `↑${row.rankDelta}`
              : row.rankDelta && row.rankDelta < 0
                ? `↓${Math.abs(row.rankDelta)}`
                : "";
          const priceBadge =
            row.priceDirection === "decrease"
              ? "降价"
              : row.priceDirection === "increase"
                ? "涨价"
                : "";
          return `<tr>
            <td style="padding:9px 0;width:36px;color:#0066cc;font-size:12px;font-weight:800;">#${row.rank}</td>
            <td style="padding:9px 6px;font-size:12px;"><strong>${escapeHtml(row.modelName)}</strong><br><span style="color:#85858c;font-size:10px;">${escapeHtml(row.providerName)}</span></td>
            <td style="padding:9px 0;text-align:right;font-size:12px;"><strong>¥${row.priceCny.toFixed(2)}</strong><br><span style="color:#85858c;font-size:10px;">${escapeHtml(row.displayPrice)}</span></td>
            <td style="padding:9px 0 9px 8px;text-align:right;font-size:10px;font-weight:800;color:${row.priceDirection === "increase" || (row.rankDelta ?? 0) < 0 ? "#cf4d3f" : "#0f9f5f"};">${[rankBadge, priceBadge].filter(Boolean).join(" · ")}</td>
          </tr>`;
        })
        .join("");
      return `<p style="margin:22px 0 5px;color:#85858c;font-size:12px;font-weight:800;">${escapeHtml(table.label)}</p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #ececef;">${rows}</table>`;
    })
    .join("");
  const textTables = tables
    .map(
      (table) =>
        `${table.label}\n${table.rows
          .map((row) => {
            const movement = row.isNew
              ? "新上榜"
              : row.rankDelta
                ? `${row.rankDelta > 0 ? "上升" : "下降"}${Math.abs(row.rankDelta)}名`
                : "";
            const priceChange = row.priceDirection
              ? row.priceDirection === "decrease"
                ? "降价"
                : "涨价"
              : "";
            return `#${row.rank} ${row.providerName} · ${row.modelName} ¥${row.priceCny.toFixed(2)} ${[movement, priceChange].filter(Boolean).join(" / ")}`;
          })
          .join("\n")}`,
    )
    .join("\n\n");
  const removedHtml = removed.length
    ? `<p style="margin:22px 0 5px;color:#85858c;font-size:12px;font-weight:800;">移出榜单</p>
      <ul style="margin:0;padding:12px 12px 12px 28px;border-top:1px solid #ececef;color:#5f5f65;font-size:12px;line-height:1.7;">${removed
        .map(
          (row) =>
            `<li>${escapeHtml(row.metricLabel)} · <strong>${escapeHtml(row.modelName)}</strong>（${escapeHtml(row.providerName)}）${row.previousRank === null ? "" : `，原第 ${row.previousRank} 名`}${row.previousDisplayPrice ? `，原价 ${escapeHtml(row.previousDisplayPrice)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : "";
  const removedText = removed.length
    ? `\n\n移出榜单\n${removed
        .map(
          (row) =>
            `${row.metricLabel} · ${row.providerName} · ${row.modelName}${row.previousRank === null ? "" : `（原第 ${row.previousRank} 名）`}${row.previousDisplayPrice ? ` ${row.previousDisplayPrice}` : ""}`,
        )
        .join("\n")}`
    : "";
  const html = shell(`
    <p style="margin:0;color:#0f9f5f;font-size:12px;font-weight:800;">API 价格排行榜更新</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">${escapeHtml(subject)}</h1>
    <p style="margin:0;color:#5f5f65;font-size:13px;line-height:1.6;">三个榜单的当前前三与值得关注的变化都在这里。</p>
    ${tableHtml}
    ${removedHtml}
    <p style="margin:24px 0 0;"><a href="${safeViewUrl}" style="display:inline-block;padding:13px 19px;border-radius:12px;background:#0066cc;color:white;text-decoration:none;font-size:14px;font-weight:700;">查看完整榜单</a></p>
    <p style="margin:22px 0 0;color:#85858c;font-size:11px;"><a href="${safeUnsubscribeUrl}" style="color:#0066cc;">退订排行榜通知</a></p>
  `);

  return {
    subject,
    html,
    text: `${subject}\n\n${textTables}${removedText}\n\n查看完整榜单：${safeViewTextUrl}\n退订：${safeUnsubscribeTextUrl}`,
  };
}

export function modelCatalogDigestEmail({
  models,
  catalogVersion,
  viewUrl,
  unsubscribeUrl,
}: ModelCatalogDigestTemplateInput) {
  const rows = models
    .map(
      (model) => `<tr>
        <td style="padding:11px 0;border-bottom:1px solid #ececef;"><a href="${safeHttpUrl(model.url)}" style="color:#1d1d1f;text-decoration:none;font-size:13px;font-weight:700;">${escapeHtml(model.name)}</a><br><span style="color:#85858c;font-size:11px;">${escapeHtml(model.labName)} · ${escapeHtml(model.releaseDate)}</span></td>
      </tr>`,
    )
    .join("");
  const html = shell(`
    <p style="margin:0;color:#0066cc;font-size:12px;font-weight:800;">API 模型目录更新</p>
    <h1 style="margin:10px 0 8px;font-size:25px;line-height:1.2;">发现 ${models.length} 个新模型</h1>
    <p style="margin:0 0 14px;color:#5f5f65;font-size:13px;line-height:1.6;">以下 canonical model 首次出现在最新目录中。</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:24px 0 0;"><a href="${safeHttpUrl(viewUrl)}" style="display:inline-block;padding:13px 19px;border-radius:12px;background:#0066cc;color:white;text-decoration:none;font-size:14px;font-weight:700;">查看模型目录</a></p>
    <p style="margin:18px 0 0;color:#85858c;font-size:10px;">目录版本 ${escapeHtml(catalogVersion.slice(0, 12))}</p>
    <p style="margin:12px 0 0;color:#85858c;font-size:11px;"><a href="${safeHttpUrl(unsubscribeUrl)}" style="color:#0066cc;">退订新模型通知</a></p>
  `);
  return {
    subject: `API 模型目录新增 ${models.length} 个模型`,
    html,
    text: `API 模型目录新增 ${models.length} 个模型\n\n${models.map((model) => `${model.name} · ${model.labName} · ${model.releaseDate}\n${safeHttpTextUrl(model.url)}`).join("\n\n")}\n\n目录：${safeHttpTextUrl(viewUrl)}\n版本：${catalogVersion}\n退订：${safeHttpTextUrl(unsubscribeUrl)}`,
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
  const safeAdminTextUrl = adminUrl ? safeHttpTextUrl(adminUrl) : null;
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
    subject: `[Low Price Radar] ${sourceName} 采集异常`,
    html,
    text: `${sourceName} 采集异常\n${errorCode}\n${occurredAt}\n${message}${safeAdminTextUrl ? `\n完整日志：${safeAdminTextUrl}` : ""}`,
  };
}
