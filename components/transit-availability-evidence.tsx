import type { Locale } from "@/lib/i18n";
import type { TransitAvailability } from "@/lib/transit/types";
import { safePublicHttpUrl } from "@/lib/public-data/urls";
import styles from "./public-data-directory.module.css";

export function TransitAvailabilityEvidence({
  availability,
  locale,
}: {
  availability: TransitAvailability;
  locale: Locale;
}) {
  if (availability.sevenDayRate === null || availability.sevenDaySamples < 1)
    return null;
  const en = locale === "en";
  const sourceUrl = safePublicHttpUrl(availability.sourceUrl);
  const sources = {
    public_status: ["公开状态页", "Public status page"],
    public_model_catalog: [
      "模型目录（非探测）",
      "Model catalogue (not a probe)",
    ],
    partner_api: ["合作方接口", "Partner API"],
    merchant_reported: ["商家自报", "Merchant reported"],
    manual_snapshot: ["人工快照", "Manual snapshot"],
    authorized_probe: ["授权探测", "Authorized probe"],
    user_submitted: ["用户提交", "User submitted"],
    synthetic_fixture: ["演示样本", "Synthetic sample"],
    unknown: ["来源未知", "Unknown source"],
  };
  const scopes = {
    station: ["站点", "Station"],
    offer: ["该报价", "This offer"],
    model: ["模型", "Model"],
    group: ["分组", "Group"],
  };
  const matches = {
    exact: ["精确匹配", "Exact match"],
    station: ["站点匹配", "Station match"],
    model: ["模型匹配", "Model match"],
    group: ["分组匹配", "Group match"],
    family: ["系列匹配", "Family match"],
    unknown: ["匹配未知", "Unknown match"],
  };
  const checked = availability.lastCheckedAt
    ? new Date(availability.lastCheckedAt)
    : null;
  return (
    <div className={styles.small} data-availability-evidence>
      <div>
        {en ? "Evidence" : "证据"}:{" "}
        {sources[availability.sourceType][en ? 1 : 0]}
        {availability.sourceLabel ? ` · ${availability.sourceLabel}` : ""}
      </div>
      <div>
        {en ? "Scope" : "范围"}:{" "}
        {availability.scope ? scopes[availability.scope][en ? 1 : 0] : "—"} ·{" "}
        {matches[availability.matchLevel ?? "unknown"][en ? 1 : 0]}
      </div>
      <div>
        {en ? "Last checked" : "最近采样"}:{" "}
        {checked && Number.isFinite(checked.getTime()) ? (
          <time dateTime={checked.toISOString()}>
            {new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(checked)}{" "}
            UTC
          </time>
        ) : en ? (
          "Not recorded"
        ) : (
          "未记录"
        )}
      </div>
      {sourceUrl ? (
        <a
          className={styles.sourceLink}
          href={sourceUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
        >
          {en ? "Availability evidence" : "查看可用性证据"}
        </a>
      ) : null}
    </div>
  );
}
