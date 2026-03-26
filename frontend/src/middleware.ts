import { NextResponse } from "next/server";

/**
 * 屏蔽编辑器/工具对 Vite 的探测（本项目为 Next.js，无该路由时会刷 404 日志）
 */
export function middleware() {
  return new NextResponse(null, { status: 200 });
}

export const config = {
  matcher: "/__vite_ping",
};
