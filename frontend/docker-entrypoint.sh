#!/bin/sh
# 根据环境变量生成 config.js，支持容器启动时指定 API 路径
API_URL="${NEXT_PUBLIC_API_URL:-${AGENTARENA_API_URL:-http://localhost:8000}}"
API_URL="${API_URL%/}"
mkdir -p /app/public
cat > /app/public/config.js << EOF
window.__AGENTARENA_CONFIG__={apiUrl:"${API_URL}"};
EOF
echo "[entrypoint] API URL: ${API_URL}"
exec "$@"
