import { ADMIN_SESSION_COOKIE, isAdminSession } from "@/lib/admin/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./login-form";

export const metadata = {
  title: "管理员登录｜Low Price Radar",
};

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  if (isAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    redirect("/admin");
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm />
    </main>
  );
}
