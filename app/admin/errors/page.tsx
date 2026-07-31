import { ADMIN_SESSION_COOKIE, isAdminSession } from "@/lib/admin/auth";
import { errorResolutionGuide } from "@/lib/admin/error-diagnostics";
import {
  adminErrorChannels,
  listAdminCollectionErrors,
  type AdminErrorChannel,
  type AdminErrorStatus,
} from "@/lib/admin/error-repository";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "../admin-header";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "采集错误｜Low Price Radar",
};

const channelLabels: Record<AdminErrorChannel, string> = {
  all: "全部渠道",
  app_store: "App Store",
  official_web: "官方网页",
  official_api: "官方 API",
  manual_official: "人工官方源",
};

const statusLabels: Record<AdminErrorStatus, string> = {
  all: "全部状态",
  open: "处理中",
  resolved: "已恢复",
};

function formatTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function parseChannel(value: string | undefined): AdminErrorChannel {
  return adminErrorChannels.includes(value as AdminErrorChannel)
    ? (value as AdminErrorChannel)
    : "all";
}

function parseStatus(value: string | undefined): AdminErrorStatus {
  return value === "open" || value === "resolved" ? value : "all";
}

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    channel?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const code =
    params.code && /^[A-Z0-9_:-]{1,80}$/.test(params.code) ? params.code : null;
  const channel = parseChannel(params.channel);
  const status = parseStatus(params.status);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.min(1_000, requestedPage)
      : 1;
  const result = await listAdminCollectionErrors({
    code,
    channel,
    status,
    page,
  });

  function href(overrides: {
    code?: string | null;
    channel?: AdminErrorChannel;
    status?: AdminErrorStatus;
    page?: number;
  }) {
    const next = new URLSearchParams();
    const nextCode = overrides.code === undefined ? code : overrides.code;
    const nextChannel = overrides.channel ?? channel;
    const nextStatus = overrides.status ?? status;
    const nextPage = overrides.page ?? 1;
    if (nextCode) next.set("code", nextCode);
    if (nextChannel !== "all") next.set("channel", nextChannel);
    if (nextStatus !== "all") next.set("status", nextStatus);
    if (nextPage > 1) next.set("page", String(nextPage));
    const query = next.toString();
    return query ? `/admin/errors?${query}` : "/admin/errors";
  }

  return (
    <main className="admin-shell admin-errors-shell">
      <AdminHeader
        current="errors"
        title="采集错误"
        description="查看错误状态、重试上下文、底层网络原因和可执行修复建议。"
      />

      <section className="admin-metrics" aria-label="错误统计">
        <div>
          <span>历史错误总数</span>
          <strong>{result.stats.total}</strong>
        </div>
        <div>
          <span>当前处理中</span>
          <strong>{result.stats.open}</strong>
        </div>
        <div>
          <span>历史已恢复</span>
          <strong>{result.stats.resolved}</strong>
        </div>
        <div>
          <span>已发告警</span>
          <strong>{result.stats.alerted}</strong>
        </div>
      </section>

      <section className="admin-error-controls">
        <nav className="admin-type-tabs" aria-label="按错误种类筛选">
          <Link href={href({ code: null })} data-active={code === null}>
            全部种类 <span>{result.stats.total}</span>
          </Link>
          {result.types.map((item) => (
            <Link
              key={item.code}
              href={href({ code: item.code })}
              data-active={code === item.code}
            >
              {item.code} <span>{item.count}</span>
            </Link>
          ))}
        </nav>

        <form className="admin-error-filter-form" method="get">
          {code && <input type="hidden" name="code" value={code} />}
          <label>
            <span>采集渠道</span>
            <select name="channel" defaultValue={channel}>
              {adminErrorChannels.map((value) => (
                <option key={value} value={value}>
                  {channelLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>错误状态</span>
            <select name="status" defaultValue={status}>
              {(["all", "open", "resolved"] as const).map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            应用筛选
          </button>
        </form>
      </section>

      <section className="admin-error-list" aria-label="错误列表">
        {result.rows.map((item, index) => {
          const guide = errorResolutionGuide({
            code: item.code,
            message: item.message,
            details: item.details,
            sourceType: item.sourceType,
            consecutiveFailures: item.consecutiveFailures,
          });
          return (
            <article className="admin-error-entry" key={item.id}>
              <header>
                <div>
                  <div className="admin-error-title-line">
                    <span
                      className="admin-status"
                      data-status={item.resolvedAt ? "active" : "pending"}
                    >
                      {item.resolvedAt ? "已恢复" : "处理中"}
                    </span>
                    <code>{item.code}</code>
                  </div>
                  <h2>{item.sourceSlug}</h2>
                  <p>
                    {item.providerName} · {item.productName} ·{" "}
                    {channelLabels[item.sourceType]}
                  </p>
                </div>
                <time dateTime={item.createdAt.toISOString()}>
                  {formatTime(item.createdAt)}
                </time>
              </header>

              <div className="admin-error-diagnosis">
                <strong>{guide.diagnosis}</strong>
                <ol>
                  {guide.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              </div>

              <dl className="admin-error-metadata">
                <div>
                  <dt>错误信息</dt>
                  <dd>{item.message}</dd>
                </div>
                <div>
                  <dt>来源状态</dt>
                  <dd>连续失败 {item.consecutiveFailures} 次</dd>
                </div>
                <div>
                  <dt>解析器</dt>
                  <dd>{item.parserVersion}</dd>
                </div>
                <div>
                  <dt>告警发送</dt>
                  <dd>{formatTime(item.alertSentAt)}</dd>
                </div>
                <div>
                  <dt>最近成功</dt>
                  <dd>{formatTime(item.lastSuccessAt)}</dd>
                </div>
                <div>
                  <dt>恢复时间</dt>
                  <dd>{formatTime(item.resolvedAt)}</dd>
                </div>
              </dl>

              <details className="admin-error-log" open={index === 0}>
                <summary>查看完整错误日志</summary>
                <div className="admin-error-log-grid">
                  <section>
                    <h3>错误上下文</h3>
                    <pre>{JSON.stringify(item.details ?? {}, null, 2)}</pre>
                  </section>
                  <section>
                    <h3>采集运行</h3>
                    <pre>
                      {JSON.stringify(
                        {
                          errorId: item.id,
                          sourceId: item.sourceId,
                          sourceUrl: item.sourceUrl,
                          sourceType: item.sourceType,
                          parserVersion: item.parserVersion,
                          lastAttemptAt: item.lastAttemptAt,
                          lastSuccessAt: item.lastSuccessAt,
                          run: item.runId
                            ? {
                                id: item.runId,
                                status: item.runStatus,
                                trigger: item.runTrigger,
                                startedAt: item.runStartedAt,
                                finishedAt: item.runFinishedAt,
                                successCount: item.runSuccessCount,
                                failureCount: item.runFailureCount,
                              }
                            : null,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                </div>
              </details>
            </article>
          );
        })}
        {result.rows.length === 0 && (
          <p className="admin-empty">当前筛选条件下没有错误记录。</p>
        )}
      </section>

      {result.pagination.totalPages > 1 && (
        <nav className="admin-pagination" aria-label="错误分页">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })}>上一页</Link>
          ) : (
            <span aria-disabled="true">上一页</span>
          )}
          <strong>
            第 {page} / {result.pagination.totalPages} 页 · 共{" "}
            {result.pagination.total} 条
          </strong>
          {page < result.pagination.totalPages ? (
            <Link href={href({ page: page + 1 })}>下一页</Link>
          ) : (
            <span aria-disabled="true">下一页</span>
          )}
        </nav>
      )}
    </main>
  );
}
