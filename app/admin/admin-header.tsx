import Link from "next/link";

export function AdminHeader({
  current,
  title,
  description,
}: {
  current: "subscriptions" | "errors";
  title: string;
  description: string;
}) {
  return (
    <>
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">AI 价签 · 管理后台</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <form action="/api/admin/logout" method="post">
          <button className="secondary-button" type="submit">
            退出登录
          </button>
        </form>
      </header>
      <nav className="admin-section-nav" aria-label="管理员功能">
        <Link href="/admin" data-active={current === "subscriptions"}>
          订阅通知
        </Link>
        <Link href="/admin/errors" data-active={current === "errors"}>
          采集错误
        </Link>
      </nav>
    </>
  );
}
