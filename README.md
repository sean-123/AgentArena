# AgentArena

开源 AI Agent 基准测试与排行榜平台，支持 Web 端数据集管理、多 Agent 评估、ELO 排名与分布式 Worker。

---

## 项目介绍

### 一句话定位

**AgentArena** 是一个面向 AI Agent 的系统化评测平台，帮助你用统一标准对比多个 Agent 的回答质量，并以 ELO 排行榜和可执行的优化建议呈现结果。

### 核心价值

当团队需要从不同模型、不同提示词、不同 RAG 配置中选出表现最好的 Agent 时，往往依赖人工抽检或零散的脚本评测，难以形成可复现、可对比的结论。AgentArena 提供了**端到端的评测工作流**：

- **统一标准**：同一套数据集、同一套 LLM Judge 指标（正确性、完整性、清晰度、幻觉控制）
- **多 Agent 并行**：一次任务可评估多个 Agent，支持分布式 Worker 横向扩展
- **可复现对比**：每次运行独立存储，可回溯历史批次、对比不同迭代的效果
- **可执行反馈**：LLM Judge 输出中文的优缺点与优化建议，任务总结报告自动聚合高频项并关联到具体问答示例，便于落地改进

### 典型工作流

通过 Web 控制台完成全流程：

1. **管理数据集**：导入 JSON 或 Excel 测试用例，支持版本化管理、Excel 模板下载
2. **配置 Agent**：为每个待评测的 Agent 配置 HTTP 接口、认证、流式开关等（可选 Langfuse 全局配置）
3. **创建评估任务**：选择数据集版本和 Agent 版本，一键发起评估
4. **执行评测**：Worker 从 Redis 队列拉取任务，调用 Agent 获取回答 → LLM Judge 打分 → 写入数据库（按条提交，任务详情可实时看进度与日志）
5. **查看结果**：排行榜 ELO 排名、逐条评测详情，以及**任务总结报告**（高频优缺点、回复质量、信息准确度、体验改进建议等）

### 特色能力

| 能力 | 说明 |
|------|------|
| **Persona 人设** | 根据人设描述将规范问题改写为更自然的提问，模拟真实用户表达 |
| **任务总结报告** | 聚合评测中的 pros/cons，按优缺点举例，并生成质量与体验类总评 |
| **通用大模型对比** | 可将自研 Agent 与豆包、通义千问、DeepSeek 等通用模型同场对比 |
| **强制完成与自愈** | 任务卡住时可手动强制完成；详情接口会按实际评测数修正任务状态 |

### 适用场景

- **产品 / 算法团队**：迭代提示词、模型、RAG 配置时，需要量化对比效果
- **QA 与验收**：对 AI 回答质量做系统性回归测试
- **竞品对比**：与开源或商业模型做基准测试

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **Agent 基准测试** | 在多数据集上评估多个 AI Agent 的回答质量 |
| **数据集管理** | 创建、版本化、导入（JSON / Excel）；测试用例列表按创建时间倒序 |
| **测试用例 ID** | 主键为「数据集 + 版本 + 外部 id」组合，避免跨数据集撞号；`id` 列可选，不填则自动生成 |
| **Arena 排行榜** | 基于 ELO 的排名，每次运行独立结果，支持多批次对比 |
| **评估引擎** | LLM Judge 打分（正确性、完整性、清晰度、幻觉控制） |
| **分布式 Worker** | Redis 任务队列；Worker 与 API 需连接同一 MySQL、同一 Redis |
| **Persona 问题** | 根据人设将规范问题改写为自然提问 |
| **MySQL 配置** | 支持 Web 界面配置数据库 |
| **一键初始化** | 一键创建数据库与表结构 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Python 3.12、uv、FastAPI、SQLAlchemy、MySQL |
| **Worker** | Redis 队列、异步任务、LLM Judge |
| **前端** | Next.js、React、TypeScript、Ant Design |

---

## 快速开始

### 前置要求

- Python 3.12+
- Node.js 18+
- MySQL 5.7+
- Redis 6+

### 1. 安装 uv

```bash
# Windows (PowerShell)
irm https://astral.sh/uv/install.ps1 | iex

# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. 后端配置与启动

```bash
cd AgentArena/backend
uv sync
cp .env.example .env
# 编辑 .env：MySQL、Redis、OpenAI API Key、TZ（可选，见下文）
```

编辑 `.env` 示例：

```env
# 时区（日志与本地时间显示，Docker 与本地均可设置）
TZ=Asia/Shanghai

# 数据库 (MySQL)
AGENTARENA_DB_HOST=localhost
AGENTARENA_DB_PORT=3306
AGENTARENA_DB_USER=root
AGENTARENA_DB_PASSWORD=your_password
AGENTARENA_DB_NAME=agent_arena

# Redis
AGENTARENA_REDIS_HOST=localhost
AGENTARENA_REDIS_PORT=6379
AGENTARENA_REDIS_PASSWORD=
AGENTARENA_REDIS_DB=0

# LLM Judge (OpenAI / 兼容接口)
AGENTARENA_OPENAI_API_KEY=sk-...
AGENTARENA_LLM_MODEL=gpt-4o-mini
# 使用阿里云 DashScope 示例：
# AGENTARENA_OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/
```

启动 API 服务：

```bash
uv run uvicorn agentarena.main:app --reload
```

### 3. 初始化数据库

```bash
curl -X POST http://localhost:8000/api/system/database/init
```

或在 Web 控制台：**设置 → 数据库初始化**。

### 4. Worker（用于执行评估任务）

**Worker 与 API 是独立进程**，修改 Worker 代码或配置后需单独重启 Worker。

另开终端：

```bash
cd AgentArena/backend
uv run agentarena-worker
```

请确保 **API 与 Worker 使用相同的 `DATABASE_URL` / MySQL 与 Redis 配置**，否则任务会跑但前端进度与日志不更新。

### 5. 前端

```bash
cd AgentArena/frontend
npm install
# 本地开发：创建 .env.local
# AGENTARENA_API_URL=http://localhost:8000
npm run dev
```

访问 http://localhost:3000

### 6. Docker 一键部署

```bash
cd AgentArena/docker
docker compose up -d
```

**镜像说明**：

- `backend`、`worker`、`frontend` 的 Dockerfile 内已设置默认时区（`tzdata` + `TZ=Asia/Shanghai`，构建时 `--build-arg TZ=...` 可覆盖）。
- `docker-compose.yml` 中为 mysql、redis、backend、worker、frontend 均设置了 `TZ: Asia/Shanghai`。
- 从 `docker/` 目录执行 `build-push.bat` 构建镜像时，脚本会传入 `--build-arg TZ`（默认 `Asia/Shanghai`）。

**Docker 镜像配置说明**：backend 与 worker 镜像内已内置 `.env.example` 作为默认配置。启动容器时可通过 `-e` 或 `environment:` 传入环境变量覆盖默认值；未传入的项将使用镜像内的默认配置。

```bash
# 示例：运行时覆盖数据库与 Redis
docker run -p 8000:8000 \
  -e TZ=Asia/Shanghai \
  -e AGENTARENA_DB_HOST=mysql \
  -e AGENTARENA_DB_PASSWORD=your_password \
  -e AGENTARENA_REDIS_URL=redis://redis:6379 \
  your-registry/agentarena-backend:v1.0.0
```

---

## Nacos 配置中心（可选）

Backend 与 Worker 支持从 Nacos 读取配置。**若配置了 Nacos，则优先使用 Nacos 中的配置；未配置则沿用 .env**。

### 启用 Nacos

设置环境变量 `NACOS_SERVER_ADDR` 即启用：

```bash
# 必填：Nacos 服务地址
NACOS_SERVER_ADDR=localhost:8848

# 可选
NACOS_DATA_ID=agentarena          # 配置 Data ID，默认 agentarena
NACOS_GROUP=DEFAULT_GROUP        # 配置 Group，默认 DEFAULT_GROUP
NACOS_NAMESPACE_ID=              # 命名空间 ID（tenant）
NACOS_USERNAME=                  # Nacos 认证用户名
NACOS_PASSWORD=                  # Nacos 认证密码
NACOS_TIMEOUT=5                  # 拉取超时秒数，默认 5
```

### Nacos 配置内容格式

支持 **properties** 和 **JSON** 两种格式，键名与 .env 一致（如 `AGENTARENA_DB_HOST`、`AGENTARENA_REDIS_URL` 等）：

**properties 示例：**
```properties
AGENTARENA_DB_HOST=mysql
AGENTARENA_DB_PASSWORD=xxx
AGENTARENA_REDIS_URL=redis://redis:6379
AGENTARENA_OPENAI_API_KEY=sk-xxx
```

**JSON 示例：**
```json
{
  "AGENTARENA_DB_HOST": "mysql",
  "AGENTARENA_REDIS_URL": "redis://redis:6379"
}
```

### 配置优先级

**Nacos 已配置且拉取成功**：Nacos 中的值会覆盖 .env 和启动时的环境变量。  
**Nacos 未配置或拉取失败**：使用 .env 及现有环境变量。

---

## 环境变量详解

| 变量 | 说明 | 示例 |
|------|------|------|
| `TZ` | 容器/进程时区（日志与时间显示） | `Asia/Shanghai` |
| `AGENTARENA_DB_HOST` | MySQL 主机 | `localhost` |
| `AGENTARENA_DB_PORT` | MySQL 端口 | `3306` |
| `AGENTARENA_DB_USER` | 数据库用户 | `root` |
| `AGENTARENA_DB_PASSWORD` | 数据库密码 | |
| `AGENTARENA_DB_NAME` | 数据库名 | `agent_arena` |
| `AGENTARENA_REDIS_HOST` | Redis 主机 | `localhost` |
| `AGENTARENA_REDIS_PORT` | Redis 端口 | `6379` |
| `AGENTARENA_REDIS_PASSWORD` | Redis 密码（可选） | |
| `AGENTARENA_REDIS_DB` | Redis 库号 | `0` |
| `AGENTARENA_REDIS_URL` | Redis 完整 URL（覆盖 host/port 等） | `redis://redis:6379` |
| `AGENTARENA_API_HOST` | API 监听地址 | `0.0.0.0` |
| `AGENTARENA_API_PORT` | API 端口 | `8000` |
| `AGENTARENA_OPENAI_API_KEY` | LLM API 密钥 | `sk-...` |
| `AGENTARENA_OPENAI_BASE_URL` | LLM API 地址（可选） | 默认 OpenAI |
| `AGENTARENA_LLM_MODEL` | LLM 模型名 | `gpt-4o-mini` |
| `AGENT_TW_SERVICE_TOKEN` | Agent Bearer Token | 在 Agent `auth_token_env` 中引用 |
| `AGENTARENA_API_URL` | 前端代理目标地址（API Route 转发目标） | `http://backend:8000` |
| `NACOS_SERVER_ADDR` | Nacos 服务地址（启用后优先从 Nacos 拉取配置） | `localhost:8848` |
| `NACOS_DATA_ID` | Nacos 配置 Data ID | `agentarena` |
| `NACOS_GROUP` | Nacos 配置 Group | `DEFAULT_GROUP` |
| `NACOS_NAMESPACE_ID` | Nacos 命名空间 ID（可选） | |
| `NACOS_USERNAME` / `NACOS_PASSWORD` | Nacos 认证（可选） | |

---

## 前端代理与 API 地址

前端通过 **API Route** 代理 `/api/*` 到后端，浏览器只需访问前端地址，无需直连后端。

**流程**：浏览器请求 `http://localhost:3000/api/datasets` → Next.js 转发到 `AGENTARENA_API_URL/api/datasets` → 返回结果。

### 配置 AGENTARENA_API_URL（必填）

**必须使用 `AGENTARENA_API_URL`**，勿用 `NEXT_PUBLIC_API_URL`。Next.js 会在构建时内联 `NEXT_PUBLIC_*`，导致运行时 env 无法生效。

- **Docker**：`-e AGENTARENA_API_URL=http://backend:8000`
- **docker-compose**：`AGENTARENA_API_URL: http://backend:8000`
- **本地开发**：`frontend/.env.local` 中 `AGENTARENA_API_URL=http://localhost:8000`

---

## 数据集与导入

### Excel 模板

- 数据集页面可下载 **「下载 Excel 模板」**（静态文件 `testcase-import-template.xlsx`）。
- 仓库内源文件与生成脚本：`templates/testcase-import-template.xlsx`、`scripts/generate_excel_template.py`（生成时会同步到 `frontend/public/`）。

### 列说明

| 列名 | 必填 | 说明 |
|------|------|------|
| `id` | **否** | 不填则自动生成；填则与数据集、版本组合成全局唯一主键 |
| `question` | **是** | 评测问题（也支持 `q`、`问题`） |
| `persona_question` | 否 | 人设问题；若 `key_points` 为空且本列为逗号分隔内容，会解析为要点 |
| `key_points` | 否 | 要点，逗号或 JSON 数组；列名也支持 `要点`、`关键点` |
| `domain` / `difficulty` | 否 | 领域、难度 |

### 测试用例 ID 规则

- 未提供 `id`：系统生成 `tc_` + 随机串。
- 提供 `id`：存储为 `{dataset_id}_{version_id}_{清洗后的 id}`（总长 ≤50 字符；超长则哈希缩短），与**数据集 + 版本**绑定，避免与其它数据集重复。
- **Excel 再次导入**：同一版本下相同组合 id 的**行会更新**已有记录，并返回 `imported`（新增条数）与 `updated`（更新条数）。
- **手动新增**：若填写 id 且与当前版本已有记录冲突，接口返回 **409**。

---

## 使用流程

### 1. 配置数据库（首次）

在 **设置** 页面配置 MySQL 连接，点击 **数据库初始化**。

### 2. 创建数据集

- 在 **数据集** 页面创建数据集及版本。
- 支持 **JSON 导入** 或 **Excel 导入**；可下载 Excel 模板。
- **查看数据** 抽屉中，测试用例列表按 **创建时间倒序**（最新在前）。

### 3. 注册 Agent

在 **Agents** 页面添加 Agent，配置：

- 名称、HTTP 接口 `base_url`、`endpoint`
- 提问字段 `question_key`
- `auth_token` / `auth_token_env`（认证）
- `stream`（是否流式）
- `persona`（人设，用于改写问题）

可选：在 `.env` 或 Nacos 中配置 **Langfuse**（`AGENTARENA_LANGFUSE_*`），用于总结报告中的 Prompt 优化建议。

### 4. 创建评估任务

在 **任务** 页面：

- 选择数据集版本
- 选择参与评估的 Agent（及可选对比模型）
- 点击 **运行** 发起评估

任务运行中可打开 **查看详情**：执行进度与执行日志会随轮询刷新；单条回答超过预览长度时可点 **「更多」** 展开全文，**「收起」** 缩回。

### 5. 查看排行榜

- 在 **排行榜** 页面查看 ELO 排名
- 筛选 **任务** 与 **运行批次**
- 展开行查看每次评测的提问、回答、优点、缺点、优化建议

---

## 评分指标

LLM Judge 对每次回答打分（1–5 分）：

| 指标 | 含义 |
|------|------|
| **正确性 (Correctness)** | 事实准确、与 key_points 匹配 |
| **完整性 (Completeness)** | 覆盖期望要点 |
| **清晰度 (Clarity)** | 表达清晰、结构合理 |
| **幻觉控制 (Hallucination)** | 无捏造内容（5 为无幻觉） |

同时输出：**优点**、**缺点**、**优化建议**（均要求中文）。

---

## 排行榜逻辑

- 每次运行（task_run）有独立的排行榜
- 筛选任务后默认显示**最新一次**运行
- 可切换到历史**运行批次**对比不同时间的结果
- 详情按运行批次过滤，仅显示该批次的评测记录

---

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/system/database/init` | 一键初始化数据库 |
| GET/POST | `/api/tasks` | 任务 CRUD |
| GET | `/api/tasks/{id}/detail` | 任务详情（进度、按 Worker 的日志） |
| GET | `/api/tasks/{id}/progress-debug` | 诊断：评测条数与 total_jobs（排查 DB 是否一致） |
| POST | `/api/tasks/{id}/force-complete` | 强制标记任务完成 |
| GET/POST | `/api/datasets` | 数据集 CRUD |
| POST | `/api/datasets/import-json` | JSON 导入（新建数据集） |
| POST | `/api/datasets/.../import-excel` | Excel 导入至某版本 |
| GET/POST | `/api/agents` | Agent CRUD |
| POST | `/api/evaluation/tasks/{id}/run` | 发起评估 |
| GET | `/api/reports/leaderboard` | 排行榜（支持 task_id、task_run_id） |
| GET | `/api/reports/summary` | 任务总结报告 |

---

## 项目结构

```
AgentArena/
├── backend/
│   ├── src/agentarena/
│   │   ├── api/             # REST 路由（tasks、datasets、agents、evaluation、reports、system）
│   │   ├── core/            # 配置、数据库、init_db
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── schemas/         # Pydantic 模式
│   │   ├── services/        # 评估服务、任务分发、Langfuse 等
│   │   ├── evaluation_engine/
│   │   │   ├── agent_runner.py
│   │   │   ├── llm_judge.py
│   │   │   ├── llm_comparison.py
│   │   │   ├── arena_ranking.py
│   │   │   └── persona.py
│   │   └── utils/           # excel_importer、testcase_id 等
│   ├── worker_cli.py        # Worker 入口：uv run agentarena-worker
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── pages/           # 各业务页面（tasks、datasets、agents、leaderboard、settings）
│   │   ├── pages/api/       # API 代理 [[...path]].ts
│   │   ├── middleware.ts    # 如 /__vite_ping 占位（避免开发时 404 日志）
│   │   └── components/
│   ├── public/              # 静态资源（含 Excel 模板）
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.worker
│   ├── Dockerfile.frontend
│   └── build-push.bat       # 镜像构建与推送（含 TZ 构建参数）
├── scripts/
│   └── generate_excel_template.py
├── templates/               # Excel 模板说明与生成产物
└── README.md
```

---

## Agent 接口要求

### HTTP 请求

```
POST {base_url}{endpoint}
Content-Type: application/json
Authorization: Bearer {token}  # 若配置了 auth_token
{ "question": "用户问题" }       # 或 question_key 指定字段
```

### 响应格式

支持以下任一结构：

- `{"answer": "..."}`
- `{"response": "..."}`
- `{"text": "..."}`
- 或通过 `response_key` 指定字段

### 流式响应 (stream: true)

逐行解析 SSE，从 `{"type":"text","content":{"text":"..."}}` 中提取并拼接文本。

---

## 常见问题

### 1. Worker 无法连接 Redis

检查 `.env` 中 `AGENTARENA_REDIS_*` 配置，密码含 `@` 等特殊字符需正确编码。

### 2. 数据库初始化失败

确认 MySQL 已启动，用户有 CREATE DATABASE 权限，端口与 `.env` 一致。

### 3. 任务在跑但前端进度始终为 0

- API 与 Worker **必须连接同一 MySQL**（容器内勿用 `localhost` 指错宿主机）。
- Worker 需**单独进程**运行；改代码后需重启 Worker。
- 可调用 `GET /api/tasks/{id}/progress-debug` 查看 `ev_count` / `ce_count` 是否与 Worker 一致。

### 4. 排行榜无数据

需先运行 Worker，待评估任务完成后才会写入排行榜。

### 5. LLM Judge 未生效

检查 `AGENTARENA_OPENAI_API_KEY` 是否有效，或 `AGENTARENA_OPENAI_BASE_URL` 是否为兼容 OpenAI 的接口。

### 6. 开发时终端出现 `GET /__vite_ping 404`

部分编辑器会探测 Vite 开发服务；本项目为 Next.js。已在 `frontend/src/middleware.ts` 对 `/__vite_ping` 返回 200，避免无意义 404 日志。

---

## License

Apache 2.0
