"use client";
import { useState, type FormEvent } from "react";
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const r = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password"), next: new URLSearchParams(location.search).get("next") }) });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "登录失败，请重试"); return; }
      location.assign(data.next);
    } catch { setError("连接失败，请稍后重试"); } finally { setBusy(false); }
  }
  return <main id="main" className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
    <div className="w-full max-w-sm">
      <div aria-hidden="true" className="mb-10 flex gap-2">{[0,1,2].map(n => <span key={n} className="h-3 w-3 rounded-full bg-foreground" style={{ opacity: 1 - n * .3 }} />)}</div>
      <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">INVISIBLE_DOTS / CONTROL PLANE</p>
      <h1 className="text-3xl font-medium tracking-tight">登录管理平台</h1>
      <p className="mt-3 text-sm text-muted-foreground">登录后管理你的 Bot、工作空间和连接器。</p>
      <form onSubmit={submit} className="mt-9 space-y-5">
        <div><label htmlFor="username" className="mb-2 block text-sm">账号</label><input id="username" name="username" autoComplete="username" required maxLength={128} className="h-11 w-full rounded-md border bg-card px-3 outline-none focus:ring-2 focus:ring-ring" /></div>
        <div><label htmlFor="password" className="mb-2 block text-sm">密码</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} className="h-11 w-full rounded-md border bg-card px-3 outline-none focus:ring-2 focus:ring-ring" /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-md bg-foreground text-sm font-medium text-background disabled:opacity-50">{busy ? "正在登录…" : "登录"}</button>
      </form>
      <p className="mt-8 border-t pt-5 text-xs text-muted-foreground">会话有效期 8 小时 · 仅限授权人员使用</p>
    </div>
  </main>;
}
