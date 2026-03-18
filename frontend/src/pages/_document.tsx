import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        {/* 运行时 API 地址配置：由 Docker 启动时写入，支持 -e NEXT_PUBLIC_API_URL 覆盖 */}
        <script src="/config.js" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
