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

1. **管理数据集**：导入 JSON 或 Excel 测试用例，支持版本化管理
2. **配置 Agent**：为每个待评测的 Agent 配置 HTTP 接口、认证、流式开关等
3. **创建评估任务**：选择数据集版本和 Agent 版本，一键发起评估
4. **执行评测**：Worker 从 Redis 队列拉取任务，调用 Agent 获取回答 → LLM Judge 打分 → 写入数据库
5. **查看结果**：排行榜 ELO 排名、逐条评测详情（提问、回答、优缺点、优化建议），以及**任务总结报告**（高频优缺点举例、回复质量、信息准确度、回复体验改进建议）

### 特色能力

| 能力 | 说明 |
|------|------|
| **Persona 人设** | 根据人设描述将规范问题改写为更自然的提问，模拟真实用户表达 |
| **任务总结报告** | 聚合评测中的 pros/cons，按优缺点举例（问题+回答），并生成回复质量、信息准确度、体验改进建议 |
| **通用大模型对比** | 可将自研 Agent 与豆包、通义千问、DeepSeek 等通用模型同场对比 |
| **强制完成与自愈** | 支持任务完成后自动或手动切换状态，确保能查看总结报告 |

### 适用场景

- **产品 / 算法团队**：迭代提示词、模型、RAG 配置时，需要量化对比效果
- **QA 与验收**：对 AI 回答质量做系统性回归测试
- **竞品对比**：与开源或商业模型做基准测试

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **Agent 基准测试** | 在多数据集上评估多个 AI Agent 的回答质量 |
| **数据集管理** | 创建、版本化、导入（JSON / Excel）测试用例 |
| **Arena 排行榜** | 基于 ELO 的排名，每次运行独立结果，支持多批次对比 |
| **评估引擎** | LLM Judge 打分（正确性、完整性、清晰度、幻觉控制） |
| **分布式 Worker** | Redis 任务队列，支持横向扩展 |
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
# 编辑 .env：MySQL、Redis、OpenAI API Key
```

编辑 `.env` 示例：

```env
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

另开终端：

```bash
cd AgentArena/backend
uv run agentarena-worker
```

### 5. 前端

```bash
cd AgentArena/frontend
npm install
npm run dev
```

访问 http://localhost:3000

### 6. Docker 一键部署

```bash
cd AgentArena/docker
docker compose up -d
```

---

## 环境变量详解

| 变量 | 说明 | 示例 |
|------|------|------|
| `AGENTARENA_DB_HOST` | MySQL 主机 | `localhost` |
| `AGENTARENA_DB_PORT` | MySQL 端口 | `3306` |
| `AGENTARENA_DB_USER` | 数据库用户 | `root` |
| `AGENTARENA_DB_PASSWORD` | 数据库密码 | |
| `AGENTARENA_DB_NAME` | 数据库名 | `agent_arena` |
| `AGENTARENA_REDIS_HOST` | Redis 主机 | `localhost` |
| `AGENTARENA_REDIS_PORT` | Redis 端口 | `6379` |
| `AGENTARENA_REDIS_PASSWORD` | Redis 密码（可选） | |
| `AGENTARENA_REDIS_DB` | Redis 库号 | `0` |
| `AGENTARENA_API_HOST` | API 监听地址 | `0.0.0.0` |
| `AGENTARENA_API_PORT` | API 端口 | `8000` |
| `AGENTARENA_OPENAI_API_KEY` | LLM API 密钥 | `sk-...` |
| `AGENTARENA_OPENAI_BASE_URL` | LLM API 地址（可选） | 默认 OpenAI |
| `AGENTARENA_LLM_MODEL` | LLM 模型名 | `gpt-4o-mini` |
| `AGENT_TW_SERVICE_TOKEN` | Agent Bearer Token | 在 Agent `auth_token_env` 中引用 |

---

## 使用流程

### 1. 配置数据库（首次）

在 **设置** 页面配置 MySQL 连接，点击 **数据库初始化**。

### 2. 创建数据集

- 在 **数据集** 页面创建数据集及版本
- 支持 **JSON 导入** 或 **Excel 导入**

### 3. 注册 Agent

在 **Agents** 页面添加 Agent，配置：

- 名称、HTTP 接口 `base_url`、`endpoint`
- 提问字段 `question_key`
- `auth_token` / `auth_token_env`（认证）
- `stream`（是否流式）
- `persona`（人设，用于改写问题）

### 4. 创建评估任务

在 **任务** 页面：

- 选择数据集版本
- 选择参与评估的 Agent
- 点击 **运行** 发起评估

### 5. 查看排行榜

- 在 **排行榜** 页面查看 ELO 排名
- 筛选 **任务** 与 **运行批次**
- 展开行查看每次评测的提问、回答、优点、缺点、优化建议（均为中文）

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
| GET | `/api/tasks/{id}/runs` | 任务运行批次列表 |
| GET/POST | `/api/datasets` | 数据集 CRUD |
| POST | `/api/datasets/.../import-json` | JSON 导入 |
| POST | `/api/datasets/.../import-excel` | Excel 导入 |
| GET/POST | `/api/agents` | Agent CRUD |
| POST | `/api/evaluation/tasks/{id}/run` | 发起评估 |
| GET | `/api/reports/leaderboard` | 排行榜（支持 task_id、task_run_id） |
| GET | `/api/reports/leaderboard/detail` | 排行榜详情（含 task_run_id） |

---

## 项目结构

```
AgentArena/
├── backend/                 # FastAPI 后端
│   ├── src/agentarena/
│   │   ├── api/             # REST 路由
│   │   │   ├── tasks.py     # 任务、运行批次
│   │   │   ├── datasets.py  # 数据集、版本、导入
│   │   │   ├── agents.py    # Agent、版本
│   │   │   ├── evaluation.py
│   │   │   ├── reports.py   # 排行榜、评测详情
│   │   │   └── system.py    # 数据库初始化
│   │   ├── core/            # 配置、数据库、init_db
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── schemas/         # Pydantic 模式
│   │   ├── services/        # 评估服务、任务分发
│   │   ├── evaluation_engine/
│   │   │   ├── agent_runner.py  # HTTP 调用 Agent
│   │   │   ├── llm_judge.py     # LLM 打分
│   │   │   ├── arena_ranking.py # ELO 计算
│   │   │   └── persona.py       # Persona 问题生成
│   │   └── utils/
│   ├── worker_cli.py        # Worker 入口（uv run agentarena-worker）
│   └── pyproject.toml
├── frontend/                # Next.js 前端
│   ├── src/pages/
│   │   ├── index.tsx        # 控制台
│   │   ├── tasks/           # 任务
│   │   ├── datasets/        # 数据集
│   │   ├── agents/          # Agents
│   │   ├── leaderboard/     # 排行榜
│   │   └── settings/        # 设置
│   └── package.json
└── docker/
    ├── docker-compose.yml
    └── Dockerfile.*
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

### 3. 排行榜无数据

需先运行 Worker，待评估任务完成后才会写入排行榜。

### 4. LLM Judge 未生效

检查 `AGENTARENA_OPENAI_API_KEY` 是否有效，或 `AGENTARENA_OPENAI_BASE_URL` 是否为兼容 OpenAI 的接口。

---

## License

Apache 2.0
