import { ADMIN_SESSION_COOKIE, isAdminSession } from "@/lib/admin/auth";
import {
  listAdminTransitDirectoryEntries,
  listAdminTransitSubmissions,
} from "@/lib/transit/directory";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminHeader } from "../admin-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "中转站申请｜Low Price Radar" };

const feedback: Record<string, string> = {
  created: "站点已添加并同步到公开目录。",
  updated: "目录信息已保存。",
  approved: "申请已通过并加入公开目录。",
  rejected: "申请已标记为拒绝。",
  invalid: "提交内容不完整或格式无效，请检查后重试。",
  failed: "操作失败，可能存在重复网址，请检查后重试。",
};

const statusLabels: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

function formatTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function suggestedName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type EntryFieldsProps = {
  defaults: {
    name: string;
    websiteUrl: string;
    descriptionZh: string;
    descriptionEn: string;
    rank: number;
    published: boolean;
  };
};

function EntryFields({ defaults }: EntryFieldsProps) {
  return (
    <div className="admin-directory-fields">
      <label>
        <span>网站标题</span>
        <input
          name="name"
          defaultValue={defaults.name}
          maxLength={100}
          required
        />
      </label>
      <label>
        <span>网站链接</span>
        <input
          name="websiteUrl"
          type="url"
          defaultValue={defaults.websiteUrl}
          maxLength={2048}
          required
        />
      </label>
      <label className="admin-directory-wide">
        <span>中文介绍</span>
        <input
          name="descriptionZh"
          defaultValue={defaults.descriptionZh}
          maxLength={160}
          required
        />
      </label>
      <label className="admin-directory-wide">
        <span>英文介绍</span>
        <input
          name="descriptionEn"
          defaultValue={defaults.descriptionEn}
          maxLength={160}
          required
        />
      </label>
      <label>
        <span>排名（数字越小越靠前）</span>
        <input
          name="rank"
          type="number"
          min={0}
          max={999999}
          step={1}
          defaultValue={defaults.rank}
          required
        />
      </label>
      <label className="admin-directory-check">
        <input
          name="published"
          type="checkbox"
          defaultChecked={defaults.published}
        />
        <span>在公开目录显示</span>
      </label>
    </div>
  );
}

export default async function AdminTransitSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  const [submissions, entries, params] = await Promise.all([
    listAdminTransitSubmissions(),
    listAdminTransitDirectoryEntries(),
    searchParams,
  ]);
  const counts = {
    pending: submissions.filter((item) => item.reviewStatus === "pending")
      .length,
    approved: submissions.filter((item) => item.reviewStatus === "approved")
      .length,
    rejected: submissions.filter((item) => item.reviewStatus === "rejected")
      .length,
    published: entries.filter((item) => item.published).length,
  };
  const nextRank = Math.max(0, ...entries.map((item) => item.rank)) + 10;
  const entriesBySubmission = new Map(
    entries
      .filter((item) => item.sourceSubmissionId)
      .map((item) => [item.sourceSubmissionId, item]),
  );

  return (
    <main className="admin-shell admin-directory-shell">
      <AdminHeader
        current="transit-submissions"
        title="中转站申请"
        description="审核用户提交，并维护 API 中转站公开目录的内容与排序。"
      />

      <section className="admin-metrics" aria-label="中转站申请统计">
        <div>
          <span>待审核</span>
          <strong>{counts.pending}</strong>
        </div>
        <div>
          <span>已通过</span>
          <strong>{counts.approved}</strong>
        </div>
        <div>
          <span>已拒绝</span>
          <strong>{counts.rejected}</strong>
        </div>
        <div>
          <span>公开站点</span>
          <strong>{counts.published}</strong>
        </div>
      </section>

      {params.message && feedback[params.message] ? (
        <p className="admin-directory-feedback" role="status">
          {feedback[params.message]}
        </p>
      ) : null}

      <section className="admin-directory-section">
        <header>
          <div>
            <p className="admin-eyebrow">Review queue</p>
            <h2>收录申请</h2>
          </div>
          <span>{submissions.length} 条</span>
        </header>
        <div className="admin-directory-list">
          {submissions.map((submission) => {
            const approvedEntry = entriesBySubmission.get(submission.id);
            return (
              <article className="admin-directory-card" key={submission.id}>
                <header>
                  <div>
                    <span
                      className="admin-status"
                      data-status={submission.reviewStatus}
                    >
                      {statusLabels[submission.reviewStatus] ??
                        submission.reviewStatus}
                    </span>
                    <time dateTime={submission.createdAt.toISOString()}>
                      {formatTime(submission.createdAt)}
                    </time>
                  </div>
                  <a
                    href={submission.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    打开提交网址
                  </a>
                </header>
                <p className="admin-directory-notice">
                  邮箱已通过验证码验证；完整地址随管理员通知邮件发送，通知成功后按隐私规则从申请记录中清除。
                  通知状态：{submission.notificationStatus}。
                </p>
                <form
                  action={`/api/admin/transit-submissions/${submission.id}/approve`}
                  method="post"
                >
                  <EntryFields
                    defaults={{
                      name:
                        approvedEntry?.name ??
                        suggestedName(submission.websiteUrl),
                      websiteUrl:
                        approvedEntry?.websiteUrl ?? submission.websiteUrl,
                      descriptionZh:
                        approvedEntry?.descriptionZh ?? submission.description,
                      descriptionEn:
                        approvedEntry?.descriptionEn ?? submission.description,
                      rank: approvedEntry?.rank ?? nextRank,
                      published: approvedEntry?.published ?? true,
                    }}
                  />
                  <div className="admin-directory-actions">
                    <button className="primary-button" type="submit">
                      {submission.reviewStatus === "approved"
                        ? "更新并保持通过"
                        : "同意并发布"}
                    </button>
                    {submission.reviewStatus !== "rejected" ? (
                      <button
                        className="secondary-button"
                        type="submit"
                        formAction={`/api/admin/transit-submissions/${submission.id}/reject`}
                        formNoValidate
                      >
                        拒绝申请
                      </button>
                    ) : null}
                  </div>
                </form>
              </article>
            );
          })}
          {submissions.length === 0 ? (
            <p className="admin-empty">当前没有中转站收录申请。</p>
          ) : null}
        </div>
      </section>

      <section className="admin-directory-section">
        <header>
          <div>
            <p className="admin-eyebrow">Public directory</p>
            <h2>公开列表</h2>
          </div>
          <span>{entries.length} 个</span>
        </header>
        <div className="admin-directory-list">
          {entries.map((entry) => (
            <form
              className="admin-directory-card"
              action={`/api/admin/transit-directory/${entry.id}`}
              method="post"
              key={entry.id}
            >
              <EntryFields defaults={entry} />
              <div className="admin-directory-actions">
                <button className="primary-button" type="submit">
                  保存修改
                </button>
                <span>最近更新：{formatTime(entry.updatedAt)}</span>
              </div>
            </form>
          ))}
        </div>
      </section>

      <details className="admin-directory-create">
        <summary>手动添加站点</summary>
        <form action="/api/admin/transit-directory" method="post">
          <EntryFields
            defaults={{
              name: "",
              websiteUrl: "https://",
              descriptionZh: "",
              descriptionEn: "",
              rank: nextRank,
              published: true,
            }}
          />
          <button className="primary-button" type="submit">
            添加到目录
          </button>
        </form>
      </details>
    </main>
  );
}
