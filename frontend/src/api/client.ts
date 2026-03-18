/**
 * API 请求使用同源路径，由 Next.js rewrites 代理到后端。
 * 浏览器请求 /api/* -> Next.js 转发到 NEXT_PUBLIC_API_URL/api/*
 * 只需访问前端地址（如 http://10.2.1.16:3000），无需配置可被浏览器直连的后端地址。
 */
function getApiBase(): string {
  return "";
}

function _formatFetchError(e: unknown, path: string): string {
  const msg = (e as Error).message || String(e);
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
    return `请求失败: 无法连接后端。请检查后端是否已启动，以及 NEXT_PUBLIC_API_URL 是否配置正确`;
  }
  return msg;
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : "/" + path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch (e) {
    throw new Error(_formatFetchError(e, path));
  }
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
