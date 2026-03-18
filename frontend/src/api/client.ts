/** 获取 API 根路径：优先运行时配置（容器启动时 -e NEXT_PUBLIC_API_URL），其次构建时 NEXT_PUBLIC_API_URL，最后默认值 */
function getApiBase(): string {
  if (typeof window !== "undefined") {
    const cfg = (window as { __AGENTARENA_CONFIG__?: { apiUrl?: string } }).__AGENTARENA_CONFIG__;
    if (cfg?.apiUrl) return cfg.apiUrl.replace(/\/$/, ""); // 去掉末尾斜杠
  }
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path.startsWith("/") ? path : "/" + path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path.startsWith("/") ? path : "/" + path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path.startsWith("/") ? path : "/" + path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${getApiBase()}${path.startsWith("/") ? path : "/" + path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiPostFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getApiBase()}${path.startsWith("/") ? path : "/" + path}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
