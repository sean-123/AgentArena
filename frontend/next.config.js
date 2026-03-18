/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "antd",
    "@ant-design/icons",
    "rc-util",
    "rc-pagination",
    "rc-picker",
    "rc-notification",
    "rc-tooltip",
    "rc-tree",
    "rc-table",
  ],
  // 代理由 pages/api/[[...path]].ts 实现，每次请求读取运行时的 NEXT_PUBLIC_API_URL
};

module.exports = nextConfig;
