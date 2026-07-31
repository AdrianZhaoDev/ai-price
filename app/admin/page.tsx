import { ADMIN_SESSION_COOKIE, isAdminSession } from "@/lib/admin/auth";
import { listAdminSubscriptions } from "@/lib/admin/repository";
import { providerCatalog } from "@/lib/data/catalog";
import { API_RANKING_PROVIDER_SLUG } from "@/lib/subscriptions/scopes";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "./admin-header";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "订阅管理｜Low Price Radar",
};

type StatusFilter = "all" | "pending" | "active" | "unsubscribed";

const statusLabels: Record<StatusFilter, string> = {
  all: "全部",
  pending: "待确认",
  active: "已生效",
  unsubscribed: "已退订",
};

function formatTime(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  const requestedStatus = (await searchParams).status;
  const status: StatusFilter =
    requestedStatus === "pending" ||
    requestedStatus === "active" ||
    requestedStatus === "unsubscribed"
      ? requestedStatus
      : "all";
  const subscriptions = await listAdminSubscriptions();
  const visible =
    status === "all"
      ? subscriptions
      : subscriptions.filter((item) => item.status === status);
  const counts = {
    all: subscriptions.length,
    active: subscriptions.filter((item) => item.status === "active").length,
    pending: subscriptions.filter((item) => item.status === "pending").length,
    unsubscribed: subscriptions.filter((item) => item.status === "unsubscribed")
      .length,
  };
  const providerMap = new Map(
    providerCatalog.map((provider) => [provider.id, provider]),
  );

  return (
    <main className="admin-shell">
      <AdminHeader
        current="subscriptions"
        title="订阅通知"
        description="查看全部订阅记录，时间按中国标准时间显示。"
      />

      <section className="admin-metrics" aria-label="订阅统计">
        {(["all", "active", "pending", "unsubscribed"] as const).map((key) => (
          <div key={key}>
            <span>{statusLabels[key]}</span>
            <strong>{counts[key]}</strong>
          </div>
        ))}
      </section>

      <nav className="admin-filters" aria-label="按状态筛选">
        {(["all", "active", "pending", "unsubscribed"] as const).map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/admin" : `/admin?status=${key}`}
            data-active={status === key}
          >
            {statusLabels[key]} <span>{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <section className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>订阅邮箱</th>
              <th>通知范围</th>
              <th>状态</th>
              <th>确认时间</th>
              <th>最近更新</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const rankingSubscription =
                item.providerSlug === API_RANKING_PROVIDER_SLUG;
              const provider = providerMap.get(item.providerSlug);
              const plan =
                item.planSlug === "*"
                  ? null
                  : provider?.offers.find(
                      (offer) => offer.planId === item.planSlug,
                    );
              return (
                <tr key={item.id}>
                  <td className="admin-email">{item.email}</td>
                  <td>
                    <strong>
                      {rankingSubscription
                        ? "API 价格排行榜"
                        : (provider?.name ?? item.providerSlug)}
                    </strong>
                    <span>
                      {rankingSubscription
                        ? "缓存、非缓存与输出价格变动"
                        : item.planSlug === "*"
                          ? "全部价格通知"
                          : (plan?.planName ?? item.planSlug ?? "全部价格通知")}
                    </span>
                  </td>
                  <td>
                    <span className="admin-status" data-status={item.status}>
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td>{formatTime(item.confirmedAt)}</td>
                  <td>{formatTime(item.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="admin-empty">当前筛选条件下没有订阅记录。</p>
        )}
      </section>
    </main>
  );
}
