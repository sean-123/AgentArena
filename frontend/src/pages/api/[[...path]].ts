/**
 * API 代理：将 /api/* 请求转发到 NEXT_PUBLIC_API_URL 指定的后端。
 * 每次请求时读取运行时的 env，确保正确转发。
 */
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: false }, // 保持原始 body，支持 FormData 文件上传
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const r = req as unknown as AsyncIterable<Buffer | Uint8Array | string>;
  for await (const chunk of r) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 勿用 NEXT_PUBLIC_*，Next.js 会在构建时内联导致无法读取运行时 env
  const apiUrl = (process.env.AGENTARENA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const path = (req.query.path as string[] | undefined) || [];
  const pathStr = path.join("/");
  const q = { ...req.query };
  delete q.path;
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null)
      searchParams.set(k, Array.isArray(v) ? v[0] : String(v));
  }
  const queryStr = searchParams.toString();
  const targetUrl = `${apiUrl}/api/${pathStr}${queryStr ? "?" + queryStr : ""}`;

  try {
    const headers: Record<string, string> = {};
    const forwardHeaders = ["content-type", "accept", "authorization"];
    for (const h of forwardHeaders) {
      const v = req.headers[h];
      if (v && typeof v === "string") headers[h] = v;
    }

    const opts: RequestInit = { method: req.method || "GET", headers };
    if (req.method && !["GET", "HEAD"].includes(req.method)) {
      const body = await getRawBody(req);
      if (body.length > 0) opts.body = new Uint8Array(body);
    }

    const backendRes = await fetch(targetUrl, opts);
    const contentType = backendRes.headers.get("content-type") || "application/json";
    res.setHeader("content-type", contentType);
    res.status(backendRes.status);
    const text = await backendRes.text();
    res.send(text);
  } catch (e) {
    console.error("[API Proxy] 转发失败:", targetUrl, e);
    res.status(502).json({
      error: "代理转发失败",
      message: String(e),
      hint: "请检查 AGENTARENA_API_URL 或 NEXT_PUBLIC_API_URL 是否正确，以及后端是否可访问",
    });
  }
}
