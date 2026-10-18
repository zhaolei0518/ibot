"use client";
import { usePathname } from "next/navigation";
export function AccountSession() {
  const path = usePathname();
  if (path === "/login") return null;
  return <button className="fixed right-4 bottom-3 z-50 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground" onClick={async () => {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (response.ok || response.status === 401) location.assign("/login");
  }}>退出登录</button>;
}
