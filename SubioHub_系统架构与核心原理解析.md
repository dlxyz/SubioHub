# subiohub 系统架构与核心原理解析文档

## 1. 整体架构与技术栈选型

`subiohub` 采用经典的前后端分离架构，后端主要负责高并发的 API 代理、流量控制和计费，前端负责用户控制台和管理后台展示。

### 1.1 后端技术栈 (Go)
- **核心框架**: **Go** 语言 + **Gin** (高性能 HTTP Web 框架)。
- **ORM 框架**: **Ent** (Facebook 开源的实体关系映射框架，基于图模型，支持强类型，自动生成 `ent/schema` 代码)。
- **数据库**: **PostgreSQL** (核心业务数据持久化，通过 `ent` 进行表结构迁移和查询)。
- **缓存与中间件**: **Redis** (核心组件！用于 API Key 鉴权缓存、Token 扣费缓存、高并发限流、分布式并发控制)。
- **依赖注入**: **Wire** (Google 的编译时依赖注入工具，管理 `Handler -> Service -> Repository` 之间的复杂依赖关系)。

### 1.2 前端技术栈 (现状：Vue3 + Next.js 并行)
- **旧前端**: `frontend` 目录，技术栈为 **Vue 3** + **TypeScript** + **Vite** + **Pinia** + Vue-Router。
- **新前端**: `next-web` 目录，技术栈为 **Next.js App Router** + **React** + **TypeScript** + **Tailwind CSS** + **Zustand**。
- **当前状态**: 迁移采用“并行开发、逐步替换”的方式推进，用户中心与管理后台的高频页面正逐步从 Vue 迁移到 Next.js。

### 1.3 当前前端运行形态补充
1. **用户端**：
   - `next-web/src/app/dashboard/*` 已承接新的个人用户中心。
   - 当前已具备左侧导航、顶部横向导航、语言切换、主题切换、余额展示、用户菜单，以及多组占位路由。
2. **管理端**：
   - `next-web/src/app/admin/*` 已承接新的管理后台外壳。
   - 当前已对齐 Vue 后台左侧菜单结构，并保留 `订单中心 -> 支付看板 / 订单管理 / 套餐管理` 子菜单层级。
   - `next-web/src/app/admin/ops/page.tsx` 现已承接 `运维监控` 真实页面，不再落到占位路由。
3. **多语言**：
   - `next-web` 当前已实现一套轻量级 i18n：`zustand locale store + locales 语言包 + useI18n Hook`。
   - 用户中心和管理后台外壳，以及部分真实业务页，已支持 `zh-CN / en-US` 切换。

---

## 2. Go 语言与核心框架运行机制科普 (新手必读)

如果你之前主要接触的是 PHP、Python 这种脚本语言，这里为你通俗解释一下 Go 语言的运作机制，它与脚本语言有着本质的区别：

1. **编译型语言 (Compiled)**：Go 是一门静态强类型的编译型语言。你在宝塔上运行的并不是 `.go` 源码文件，而是源码在作者电脑上经过 `go build` 编译后生成的**一个没有任何后缀的二进制可执行文件**（类似 Windows 下的 `.exe`）。它内置了运行所需的全部环境，所以在服务器上根本不需要安装 Go 解释器或环境，直接运行即可，执行速度极快。
2. **极强的高并发能力 (Goroutine)**：Go 语言最大的杀手锏是“协程”(Goroutine)。你可以把它理解为极其轻量级的线程。开启一个 PHP 进程处理一个请求可能要占用几十兆内存，而开启一个 Go 协程处理请求只需要 2KB。这就是为什么 `subiohub` 能用极低的服务器配置扛住成千上万个并发的大模型对话请求。
3. **Gin 框架 (Web 路由)**：相当于 PHP 里的 Laravel 路由或者 Node.js 里的 Express。它负责启动一个本地 Web 服务（监听 8080 端口），接收用户的 HTTP 请求，把它们派发给对应的处理函数（Handler）。
4. **Ent 框架 (操作数据库)**：Go 是强类型语言，不能像 PHP 那样随便拼写 SQL 字符串。Ent 框架要求开发者在 `backend/ent/schema` 目录下定义好数据库表长什么样（比如 `User` 有哪些字段）。然后运行一句 `go generate` 命令，它就会自动生成几万行操作数据库的底层 Go 代码。我们在业务代码里，只需要调用 `client.User.Create()` 这种强类型方法即可，绝对安全，不会有 SQL 注入漏洞。
5. **Wire 工具 (依赖注入)**：在大型项目中，A 组件依赖 B，B 依赖 C。Wire 会在编译时自动分析这种层层依赖关系，并生成初始化代码，免去了开发者手动 `new` 大量对象的麻烦。

### 2.1 Go 语言与 Node.js / Next.js 的对比

你之前用 Next.js 写过网站，这里做一个直观的对比：

| 特性 | Go 语言 (如 subiohub) | Node.js (如 Express) | Next.js (React 框架) |
| :--- | :--- | :--- | :--- |
| **语言类型** | 静态强类型，需编译为二进制 | 动态弱类型 (JS/TS)，运行时解释 | 动态弱类型 (JS/TS)，构建后运行 |
| **并发模型** | **Goroutine (协程)**：多线程，能同时榨干 CPU 所有核心。极其适合做高并发的 API 网关。 | **单线程事件循环**：非阻塞 I/O。处理普通 Web 接口很快，但遇到密集计算（如加密解密、大规模文本分词）会卡住主线程。 | **同 Node.js**，主要专注于全栈 React 渲染和前后端同构。 |
| **运行环境** | 丢到 Linux 服务器直接跑，不需要任何依赖。 | 服务器必须安装 Node.js 环境。 | 服务器必须安装 Node.js，且占用内存较大（你之前遇到的 OOM 崩溃就是证明）。 |
| **核心定位** | **高性能后台服务器、网关、微服务**。 | 中小型后端 API、中间件、脚本。 | **SEO 友好的全栈网站、前端页面**。 |

**总结：** Go 语言天生就是为了做像 `subiohub` 这种需要疯狂转发请求、计算 Token、高并发不宕机的**“脏活累活后台”**而生的。而 Next.js 则是为了做**给普通用户看、需要被百度/谷歌搜索到的漂亮网站**而生的。两者结合（Go 做纯后端 API，Next.js 做前端展示）是目前最完美的架构。

---

## 3. 前端 SEO 优化改造方案 (Vue3 -> Next.js)

`subiohub` 目前的前端是使用 Vue3 (SPA 单页面应用) 写的。SPA 的致命缺点是：**源代码里只有一个空的 `<div id="app"></div>`，所有的页面内容都是靠 JS 在浏览器里动态渲染出来的。** 百度、谷歌的爬虫爬取时，只能看到一个空壳，这导致它的 SEO (搜索引擎优化) 极差，几乎搜不到。

如果你希望这个分销系统能够通过搜索引擎获得自然流量，**强烈建议前端部分使用 Next.js 进行重构（或套壳）**。

### 改造方案设计：Go (后端) + Next.js (前端 SSR)

我们不需要动 Go 语言写的任何核心网关逻辑，只需要把前端剥离出来：

1. **后端剥离**：保持 `subiohub` 的 Go 后端原封不动，让它专心提供 API 接口（如 `/api/auth/login`, `/api/user/info` 等）。
2. **Next.js 接管前端展示与 SEO**：
   - 使用你熟悉的 Next.js (App Router) 新建一个前端项目。
   - **首页 (Landing Page)、价格页、文章页、帮助中心**：使用 Next.js 的 **SSR (服务端渲染)** 或 **SSG (静态生成)** 技术。这样当百度爬虫访问时，Next.js 服务器会直接把渲染好、带有完整关键词 (Keywords)、描述 (Description) 和完整 HTML 结构的网页吐给爬虫，SEO 效果拉满。
   - **用户控制台 (Dashboard) 与后台管理 (Admin)**：这些页面不需要被搜索引擎收录，可以直接在 Next.js 里使用 `"use client"`（客户端渲染），通过 `fetch` 或 `axios` 调用 Go 后端提供的 API 进行数据交互。
3. **部署架构**：
   - 宝塔服务器上运行 Go 编译出来的二进制文件（监听 8080 端口，作为纯 API 提供者）。
   - 宝塔服务器上运行 Next.js 服务（监听 3000 端口，作为用户访问的入口）。
   - 用 Nginx 配置反向代理：用户访问 `www.yourdomain.com`，Nginx 把请求转给 Next.js (3000)；用户访问 `api.yourdomain.com`，Nginx 把请求转给 Go 后端 (8080)。

### 当前 Next.js 迁移补充

当前 `next-web` 已经不只是理论改造方案，而是进入可联调阶段：
1. **用户中心**：
   - 已实现 `/dashboard` 布局壳、横向导航、左侧导航、余额展示、语言切换和多组功能骨架页。
2. **管理后台**：
   - 已实现 `/admin` 布局壳和与 Vue 后台对齐的导航体系。
   - 已迁移一批真实页面，包括：管理总览、运维监控、用户管理、分组管理、渠道管理、订阅管理、账号管理、分销管理、系统设置、折扣码管理、订单管理、支付看板、套餐管理、调用记录、代理管理、卡密管理。
3. **多语言基础设施**：
   - 已拆分为 `src/i18n/locales/zh-CN.ts`、`src/i18n/locales/en-US.ts`，并由 `src/i18n/messages.ts` 聚合导出。
   - 当前用户中心与管理后台共享同一套 locale store 与 `useI18n()` 入口。

### 当前 Ops 迁移补充

当前 `next-web` 对运维监控模块的迁移，已经从“导航占位”进入“真实业务页”阶段：
1. **前端承接范围**：
   - `next-web/src/app/admin/ops/page.tsx` 当前承接 Vue `OpsDashboard.vue` 中最先需要恢复的两块能力：`运维总览` 与 `系统日志`。
   - 页面已对齐后端现有的 `dashboard/snapshot-v2`、`latency-histogram`、`error-distribution`、`settings/metric-thresholds`、`runtime/logging`、`system-logs`、`system-logs/health`、`system-logs/cleanup` 等接口。
2. **当前已恢复能力**：
   - 运维总览已支持时间范围、平台、分组、查询模式筛选，并展示健康分、QPS/TPS、SLA、请求错误率、上游错误率、延迟分布、状态码分布、系统状态和任务心跳。
   - 系统日志已支持写入健康指标、运行时日志配置、按关键字段筛选、分页列表和按当前筛选条件清理。
3. **当前未恢复能力**：
   - 告警规则、告警事件、错误详情钻取、请求详情弹窗、WebSocket 实时刷新和更复杂图表交互，仍保留为下一阶段迁移内容。

---

## 3. 核心模块结构与分层 (Backend/internal)

后端的代码结构非常规范，遵循了**领域驱动设计 (DDD)** 和 **洋葱架构** 的思想：
- **`cmd`**: 项目启动入口 (`server`, `jwtgen` 等)。
- **`internal/server/routes`**: 路由注册层，定义所有的 API 端点 (Endpoint)。
- **`internal/handler`**: 表现层（控制器），负责接收 HTTP 请求、解析参数、验证数据，调用下游的 Service。
- **`internal/service`**: 业务逻辑层，处理诸如“路由分配”、“扣费逻辑”、“用户鉴权”等核心业务。
- **`internal/repository`**: 数据持久层，负责与 PostgreSQL (通过 `ent`) 和 Redis 交互，封装了大量的 Cache 层（如 `api_key_cache.go`, `billing_cache.go`）。
- **`internal/domain`**: 领域实体层，定义跨层使用的常量和结构体。

### 3.1 日志模块与运行时路径机制

日志系统位于 `backend/internal/pkg/logger`，当前设计已经同时兼容容器部署与本地开发：
1. **显式配置优先**：
   - 若 `log.output.file_path` 显式配置，则直接使用该路径。
2. **`DATA_DIR` 次优先**：
   - 若未显式配置文件路径，但设置了 `DATA_DIR`，则默认写入 `{{DATA_DIR}}/logs/subiohub.log`。
3. **当前工作目录兜底**：
   - 若以上均未配置，则默认写入 `{working_directory}/data/logs/subiohub.log`。
   - 因为 Docker 镜像工作目录通常为 `/app`，所以容器内自然会落到 `/app/data/logs/subiohub.log`。
   - 在 Windows/macOS/Linux 本地开发环境中，则会落到项目目录下的 `backend/data/logs/subiohub.log`，避免直接写死 `/app/...` 造成权限错误。
4. **启动期可写性校验**：
   - 当前日志初始化阶段会先尝试创建目录并验证文件可写，避免服务虽然启动成功，但每个请求都在运行时刷出 `Access is denied` 一类错误。

---

## 4. 核心 API 接口设计

系统 API 接口大致分为三大类：

### 4.1 客户端/用户端 API (`routes/user.go`, `routes/auth.go`)
- **登录鉴权**: `POST /api/auth/login`, OAuth 回调 (`auth_linuxdo_oauth.go`, `auth_oidc_oauth.go`)。
- **用户信息与额度**: 获取当前账户余额、充值记录、订阅状态等。
- **密钥管理**: `GET/POST /api/user/keys`，用户自己创建、管理分发给业务系统的 API Key。
- **支付充值**: 接入 Stripe/Alipay 等创建订单与 Webhook 回调 (`payment_handler.go`)。

### 4.2 管理端 API (`routes/admin.go`)
- **渠道管理**: 配置上游大模型 API 渠道（如 OpenAI 官方账号、Azure 账号、Claude 账号）。
- **分组与费率**: 设置不同用户组 (Group) 和对应的倍率 (Pricing)。
- **用户管理**: 封禁用户、手动加款、查看全局调用日志 (`ops_repo_dashboard.go`)。

### 4.3 大模型网关 API (Gateway)
对齐了主流大模型厂商的 API 格式：
- `POST /v1/chat/completions` (OpenAI 标准)
- `POST /v1/messages` (Anthropic/Claude 标准)
- `POST /v1beta/models/...` (Gemini 标准)

---

## 5. 核心原理：API 中转的流转过程 (带源码对照)

**API 中转 (Proxy/Gateway)** 是这个系统最核心的功能，它的原理可以概括为：**“劫持请求 -> 鉴权限流 -> 替换渠道凭证 -> 转发请求 -> 流式响应并计费”**。

为了更直观地理解，请看下面的**数据流转时序图**（附带了对应的 Go 代码文件标注）：

```mermaid
sequenceDiagram
    autonumber
    participant Client as 客户端 (用户应用)
    participant Router as Gin 路由<br/>(routes/gateway.go)
    participant Middleware as 鉴权中间件<br/>(api_key_cache.go)
    participant Handler as 网关控制器<br/>(handler/gateway_handler.go)
    participant Upstream as 转发模块<br/>(repository/http_upstream.go)
    participant API as 上游大模型 API<br/>(如 OpenAI 官方)
    participant DB as 数据库/缓存<br/>(Redis / Postgres)

    Client->>Router: 发起大模型请求 (携带 sk-xxx 密钥)
    Router->>Middleware: 进入鉴权拦截器
    Middleware->>DB: 查 Redis 校验 Key 和余额
    DB-->>Middleware: 返回校验通过
    Middleware->>Handler: 放行到网关控制器
    Handler->>Handler: 匹配路由策略，寻找健康的可用渠道<br/>(gateway_helper.go)
    Handler->>Upstream: 偷天换日：替换为真实 API Key，重写目标 URL
    Upstream->>API: 发起真实 HTTP 请求
    API-->>Upstream: 建立 SSE 流式连接
    Upstream-->>Client: 作为一个管道，逐字转发流式响应 (Flush)
    Upstream->>Handler: 请求彻底结束，通过分词器统计 Token 消耗
    Handler->>DB: 先扣 Redis 余额，后异步写 Postgres 日志<br/>(billing_cache.go / usage_log_repo.go)
```

### 详细解析流转的 7 个步骤：

**步骤 1：客户端发起请求**
客户端（比如一个第三方聊天网页）使用 `subiohub` 颁发的密钥，向 `subiohub` 发送标准的大模型请求：
```http
POST https://subiohub.yourdomain.com/v1/chat/completions
Authorization: Bearer sk-subiohub-user-key-xxx
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "你好"}]
}
```

**步骤 2：中间件拦截与高速鉴权** (`internal/server/middleware` & `internal/repository/api_key_cache.go`)
1. Gin 框架的网关路由接收到请求。
2. 提取 Header 中的 `Bearer Token`。
3. **高速缓存命中**：系统不直接查数据库，而是去 **Redis** 中查找这个 `sk-xxx` 是否有效，属于哪个用户，该用户当前余额是否大于 0。如果无效或欠费，直接拦截并返回 401/402 错误。

**步骤 3：并发与频次限流** (`internal/repository/concurrency_cache.go` & `rpm_cache.go`)
系统为了保护上游账号不被打封，会根据用户的分组级别，在 Redis 中检查并增加当前的并发数 (Concurrency) 和每分钟请求数 (RPM)。超限则返回 `429 Too Many Requests`。

**步骤 4：路由策略与渠道分配** (`internal/handler/gateway_helper.go` & `internal/repository/account_repo.go`)
系统根据请求的 `model`（如 `gpt-4`）和用户的 `group`（分组），在底层数据库寻找**可用且健康**的上游渠道（Account）。
- 例如，系统找到了一个底层的真实 OpenAI 渠道，它的真实密钥是 `sk-openai-real-xxx`。

**步骤 5：请求重写与透明转发** (`internal/repository/http_upstream.go`)
这是中转的核心机制：
1. `subiohub` 将原本发向自己服务器的请求，修改目标 URL 为 `api.openai.com` (或配置的其他中转地址)。
2. **偷天换日**：将 `Authorization` 头部原本用户的 `sk-subiohub...` 密钥，替换为刚刚找到的上游真实的 `sk-openai-real-xxx`。
3. 使用 Go 语言原生的 `http.Client` 发起网络请求进行转发。

**步骤 6：流式响应返回 (SSE / Streaming)**
上游（如 OpenAI）开始逐字返回响应：
1. `subiohub` 读取上游的响应流 (Server-Sent Events)。
2. `subiohub` 作为一个中间管道，收到一个字就立刻向原始客户端 flush（推送）一个字。
3. 在转发的同时，`subiohub` 内部会在内存里“数”经过的文本长度（通过开源的分词器计算 Prompt 和 Completion 的 Token 消耗）。

**步骤 7：异步扣费与日志记录** (`internal/repository/usage_log_repo.go` & `billing_cache.go`)
流式请求彻底结束后：
1. 系统得出总消耗 Token 数量（例如 1000 input tokens, 500 output tokens）。
2. 根据后台配置的倍率模型（如 gpt-4 是 0.03$/1k tokens）计算出实际扣除的额度。
3. **先扣 Redis**：为了高性能，直接在 Redis 中扣减用户的余额 (`billing_cache`)。
4. **异步落库**：将具体的调用日志、Token消耗、请求时间、IP 等信息封装成任务，异步写入 PostgreSQL 数据库的 `usage_logs` 表中。

---

## 6. 总结与二开指引

`subiohub` 的设计是一个极其标准且扛得住大流量的工业级 API 网关。
它的最大亮点在于**重度依赖 Redis 进行热点数据（鉴权、计费、限流）的操作**，从而避免了每次大模型请求都要去查询关系型数据库，极大地提高了代理的吞吐量 (QPS) 并降低了延迟。

在接下来我们要进行的**二级代理分销系统二开**中，我们将：
1. **数据库层**：在 PostgreSQL 的 `users` 相关表（`backend/ent/schema/user.go`）中建立邀请关系树。
2. **核心逻辑拦截点**：我们**只需挂载在“步骤 7（异步扣费与日志记录）”或“支付充值回调”之后**。当触发扣费或充值成功时，异步向上级代理的钱包中追加佣金余额即可，这样**完全不会影响前面 1~6 步 API 网关中转的高性能核心链路**。

### 6.1 当前工程实践补充
1. **前后端职责划分** 依旧清晰：
   - Go 后端继续承接网关、鉴权、调度、计费、支付、日志等核心能力。
   - Next.js 前端继续承接 SEO 页面、用户中心和管理后台 UI。
2. **二开开发建议**：
   - 新增业务优先通过 Go 后端暴露稳定 API，再由 `next-web` 页面消费。
   - 若已有 Vue 对应页面，应优先对齐其字段、交互顺序、接口调用顺序和多语言键位，再迁入 Next.js，避免双端行为偏移。

---

## 7. 数据库核心表结构解析 (共 26 张表)

系统基于 Ent ORM 构建了强类型的数据库 Schema。为避免遗漏，以下将系统全部的 **26 张数据表** 逐一列出，并按业务模块进行分类说明（详细定义见 `backend/ent/schema/*.go`）：

### 7.1 核心基础业务表 (7张)
1. **`users` (用户表)**
   - **说明**: 存储终端用户和代理商信息。
   - **字段解释**:
     - `id`: 主键ID
     - `email`: 登录邮箱
     - `password_hash`: 密码哈希值
     - `role`: 用户角色 (user/admin)
     - `balance`: 当前余额 (USD)
     - `concurrency`: 最大并发请求数
     - `status`: 账户状态 (active/disabled等)
     - `username`: 用户昵称
     - `notes`: 管理员备注
     - `totp_secret_encrypted`: TOTP 2FA 加密密钥
     - `totp_enabled`: 是否开启 2FA
     - `totp_enabled_at`: 2FA 开启时间
     - `balance_notify_enabled`: 是否开启余额不足通知
     - `balance_notify_threshold_type`: 余额阈值类型 (fixed/percentage)
     - `balance_notify_threshold`: 余额通知阈值
     - `balance_notify_extra_emails`: 额外接收通知的邮箱列表
     - `total_recharged`: 历史累计充值总额
     - `created_at`: 创建时间
     - `updated_at`: 更新时间
     - `deleted_at`: 软删除时间

2. **`api_keys` (API 密钥表)**
   - **说明**: 用户创建的调用凭证。
   - **字段解释**:
     - `id`: 主键ID
     - `user_id`: 归属用户ID
     - `key`: 真实的 sk-... 密钥字符串
     - `name`: 密钥名称
     - `group_id`: 绑定的分组ID（决定可用模型和费率）
     - `status`: 状态
     - `last_used_at`: 最后调用时间
     - `ip_whitelist`: IP 白名单列表
     - `ip_blacklist`: IP 黑名单列表
     - `quota`: 额度上限 (USD，0为无限制)
     - `quota_used`: 已使用额度
     - `expires_at`: 密钥过期时间
     - `rate_limit_5h`: 5小时维度的消费限额
     - `rate_limit_1d`: 1天维度的消费限额
     - `rate_limit_7d`: 7天维度的消费限额
     - `usage_5h`: 5小时内已消费额度
     - `usage_1d`: 1天内已消费额度
     - `usage_7d`: 7天内已消费额度
     - `window_5h_start`: 5小时限额窗口起始时间
     - `window_1d_start`: 1天限额窗口起始时间
     - `window_7d_start`: 7天限额窗口起始时间
     - `created_at`: 创建时间
     - `updated_at`: 更新时间
     - `deleted_at`: 软删除时间

3. **`accounts` (上游渠道账户表)**
   - **说明**: 系统最核心资产（如 OpenAI 官方账号）。
   - **字段解释**:
     - `id`: 主键ID
     - `name`: 渠道名称
     - `notes`: 备注
     - `platform`: 平台名称 (如 claude, openai)
     - `type`: 认证类型 (如 api_key, oauth)
     - `credentials`: JSONB格式的真实凭证数据
     - `extra`: 扩展配置信息
     - `proxy_id`: 绑定的代理服务器ID
     - `concurrency`: 允许的最大并发数
     - `load_factor`: 负载权重因子
     - `priority`: 调度优先级 (越小越优先)
     - `rate_multiplier`: 账号级成本计算倍率
     - `status`: 状态
     - `error_message`: 异常报错信息
     - `last_used_at`: 最后调度使用时间
     - `expires_at`: 账号过期时间
     - `auto_pause_on_expired`: 过期自动暂停调度
     - `schedulable`: 是否允许被调度器分配
     - `rate_limited_at`: 触发速率限制(429)的时间
     - `rate_limit_reset_at`: 速率限制解除时间
     - `overload_until`: 触发过载(529)的解除时间
     - `temp_unschedulable_until`: 临时不可调度解除时间
     - `temp_unschedulable_reason`: 临时不可调度的原因
     - `session_window_start`: 会话窗口起始时间(Claude Pro等使用)
     - `session_window_end`: 会话窗口结束时间
     - `session_window_status`: 会话窗口状态
     - `created_at`: 创建时间
     - `updated_at`: 更新时间
     - `deleted_at`: 软删除时间

4. **`groups` (分组表)**
   - **说明**: 连接用户与上游账号的桥梁，决定扣费倍率。
   - **字段解释**:
     - `id`: 主键ID
     - `name`: 分组名称
     - `description`: 分组描述
     - `rate_multiplier`: 用户扣费倍率
     - `is_exclusive`: 是否独占分组
     - `status`: 状态
     - `platform`: 默认平台
     - `subscription_type`: 订阅类型
     - `daily_limit_usd`: 每日消费上限
     - `weekly_limit_usd`: 每周消费上限
     - `monthly_limit_usd`: 每月消费上限
     - `default_validity_days`: 默认有效天数
     - `image_price_1k`: 1K分辨率图片单价
     - `image_price_2k`: 2K分辨率图片单价
     - `image_price_4k`: 4K分辨率图片单价
     - `claude_code_only`: 是否仅限 Claude Code 客户端
     - `fallback_group_id`: 无可用账号时的降级分组ID
     - `fallback_group_id_on_invalid_request`: 无效请求兜底分组ID
     - `model_routing`: JSONB模型路由配置
     - `model_routing_enabled`: 是否启用模型路由
     - `mcp_xml_inject`: 是否注入MCP协议提示词
     - `supported_model_scopes`: 支持的模型系列列表
     - `sort_order`: 排序权重
     - `allow_messages_dispatch`: 允许OpenAI路由到Claude
     - `require_oauth_only`: 仅限OAuth类型账号
     - `require_privacy_set`: 仅限Privacy已设置账号
     - `default_mapped_model`: 默认映射模型
     - `messages_dispatch_model_config`: OpenAI Messages 调度配置
     - `created_at`: 创建时间
     - `updated_at`: 更新时间
     - `deleted_at`: 软删除时间

5. **`usage_logs` (调用日志表)**
   - **说明**: 核心流水表，记录每次请求消耗和性能。
   - **字段解释**:
     - `id`: 主键ID
     - `user_id`: 调用用户ID
     - `api_key_id`: 使用的 API Key ID
     - `account_id`: 实际调用的上游账号ID
     - `request_id`: 请求唯一流水号
     - `model`: 请求模型名称
     - `requested_model`: 原始请求模型
     - `upstream_model`: 实际上游模型
     - `channel_id`: 渠道ID
     - `model_mapping_chain`: 模型映射链路
     - `billing_tier`: 计费层级
     - `billing_mode`: 计费模式 (token/per_request等)
     - `group_id`: 使用的分组ID
     - `subscription_id`: 关联的订阅ID
     - `input_tokens`: 输入 Token 数
     - `output_tokens`: 输出 Token 数
     - `cache_creation_tokens`: 缓存创建 Token 数
     - `cache_read_tokens`: 缓存读取 Token 数
     - `cache_creation_5m_tokens`: 5分钟缓存创建 Token
     - `cache_creation_1h_tokens`: 1小时缓存创建 Token
     - `input_cost`: 输入成本
     - `output_cost`: 输出成本
     - `cache_creation_cost`: 缓存创建成本
     - `cache_read_cost`: 缓存读取成本
     - `total_cost`: 总扣费成本
     - `actual_cost`: 实际上游成本
     - `rate_multiplier`: 扣费时应用的分组倍率
     - `account_rate_multiplier`: 账号成本倍率
     - `billing_type`: 计费类型
     - `stream`: 是否流式请求
     - `duration_ms`: 请求总耗时(毫秒)
     - `first_token_ms`: 首字延迟 TTFT(毫秒)
     - `user_agent`: 客户端 UA
     - `ip_address`: 客户端 IP
     - `image_count`: 图片生成张数
     - `image_size`: 图片尺寸
     - `cache_ttl_overridden`: 是否覆盖缓存 TTL 计费
     - `created_at`: 请求发生时间

6. **`promo_codes` (优惠码表)**
   - **说明**: 注册通用优惠码，支持多人使用。
   - **字段解释**:
     - `id`: 主键ID
     - `code`: 优惠码字符串
     - `bonus_amount`: 赠送余额金额
     - `max_uses`: 最大允许使用次数
     - `used_count`: 已被使用次数
     - `status`: 状态
     - `expires_at`: 过期时间
     - `notes`: 备注
     - `created_at`: 创建时间
     - `updated_at`: 更新时间

7. **`redeem_codes` (兑换码表)**
   - **说明**: 充值/推荐卡密，一次性核销。
   - **字段解释**:
     - `id`: 主键ID
     - `code`: 唯一卡密字符串
     - `type`: 兑换类型 (如 balance)
     - `value`: 面值金额
     - `status`: 状态 (unused/used)
     - `used_by`: 核销人的用户ID
     - `used_at`: 核销时间
     - `notes`: 备注
     - `created_at`: 创建时间
     - `group_id`: 绑定的分组ID（如有）
     - `validity_days`: 有效天数

### 7.2 支付与财务系统表 (3张)
8. **`payment_orders` (支付订单表)**
   - **说明**: 记录充值订单生命周期。
   - **字段解释**:
     - `id`: 主键ID
     - `user_id`: 下单用户ID
     - `user_email`: 用户邮箱(冗余)
     - `user_name`: 用户名(冗余)
     - `user_notes`: 用户备注
     - `amount`: 订单总额
     - `pay_amount`: 实际需支付金额
     - `fee_rate`: 支付手续费率
     - `recharge_code`: 充值流水码
     - `out_trade_no`: 内部系统订单号
     - `payment_type`: 支付方式 (alipay/stripe等)
     - `payment_trade_no`: 支付网关返回的外部流水号
     - `pay_url`: 支付跳转链接
     - `qr_code`: 支付二维码内容
     - `qr_code_img`: 二维码图片链接
     - `order_type`: 订单类型 (balance/subscription)
     - `plan_id`: 关联的订阅套餐ID
     - `subscription_group_id`: 关联的订阅分组ID
     - `subscription_days`: 订阅天数
     - `provider_instance_id`: 支付网关实例ID
     - `status`: 订单状态 (PENDING/PAID/FAILED等)
     - `refund_amount`: 退款金额
     - `refund_reason`: 退款原因
     - `refund_at`: 退款时间
     - `force_refund`: 是否强制退款
     - `refund_requested_at`: 申请退款时间
     - `refund_request_reason`: 申请退款理由
     - `refund_requested_by`: 申请退款人
     - `expires_at`: 订单支付过期时间
     - `paid_at`: 支付成功时间
     - `completed_at`: 订单完成(发货)时间
     - `failed_at`: 订单失败时间
     - `failed_reason`: 失败原因
     - `client_ip`: 下单客户端IP
     - `src_host`: 来源Host
     - `src_url`: 来源URL
     - `created_at`: 创建时间
     - `updated_at`: 更新时间

9. **`payment_provider_instances` (支付渠道配置表)**
   - **说明**: 存储各支付提供商的实例配置。
   - **字段解释**:
     - `id`: 主键ID
     - `provider_key`: 渠道驱动标识 (如 stripe)
     - `name`: 实例显示名称
     - `config`: 加密存储的配置JSON (密钥/Secret等)
     - `supported_types`: 支持的支付方式
     - `enabled`: 是否启用
     - `payment_mode`: 支付模式
     - `sort_order`: 排序权重
     - `limits`: 限额配置JSON
     - `refund_enabled`: 是否支持退款
     - `allow_user_refund`: 是否允许用户主动申请退款
     - `created_at`: 创建时间
     - `updated_at`: 更新时间

10. **`payment_audit_logs` (支付审计日志表)**
    - **说明**: 记录支付回调操作，用于对账。
    - **字段解释**:
      - `id`: 主键ID
      - `order_id`: 关联订单号
      - `action`: 操作动作 (如 callback_received)
      - `detail`: 原始回调Payload或操作详情
      - `operator`: 操作人 (system/admin)
      - `created_at`: 记录时间

### 7.3 订阅套餐系统表 (2张)
11. **`subscription_plans` (订阅套餐定义表)**
    - **说明**: 定义系统售卖的订阅套餐。
    - **字段解释**:
      - `id`: 主键ID
      - `group_id`: 套餐关联的分组ID（购买后获得该分组权限）
      - `name`: 套餐名称
      - `description`: 描述
      - `price`: 售价
      - `original_price`: 原价(划线价)
      - `validity_days`: 有效期天数
      - `validity_unit`: 有效期单位 (day/month)
      - `features`: 特权列表说明
      - `product_name`: 外部展示产品名
      - `for_sale`: 是否在售
      - `sort_order`: 排序权重
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

12. **`user_subscriptions` (用户订阅关系表)**
    - **说明**: 记录用户购买的套餐实例及用量。
    - **字段解释**:
      - `id`: 主键ID
      - `user_id`: 用户ID
      - `group_id`: 订阅赋予的分组ID
      - `starts_at`: 订阅生效时间
      - `expires_at`: 订阅过期时间
      - `status`: 订阅状态
      - `daily_window_start`: 每日限额窗口起始
      - `weekly_window_start`: 每周限额窗口起始
      - `monthly_window_start`: 每月限额窗口起始
      - `daily_usage_usd`: 每日已用额度
      - `weekly_usage_usd`: 每周已用额度
      - `monthly_usage_usd`: 每月已用额度
      - `assigned_by`: 分配人ID(管理员发放)
      - `assigned_at`: 分配时间
      - `notes`: 备注
      - `created_at`: 创建时间
      - `updated_at`: 更新时间
      - `deleted_at`: 软删除时间

### 7.4 系统配置与网络防护表 (5张)
13. **`settings` (全局动态配置表)**
    - **说明**: 以键值对形式存储后台动态配置。
    - **字段解释**:
      - `id`: 主键ID
      - `key`: 配置项标识名
      - `value`: 配置内容文本
      - `updated_at`: 最后更新时间

14. **`proxies` (代理服务器配置表)**
    - **说明**: 代理服务器配置，隐藏真实IP防封。
    - **字段解释**:
      - `id`: 主键ID
      - `name`: 代理名称
      - `protocol`: 协议 (http/socks5等)
      - `host`: 代理主机地址
      - `port`: 代理端口
      - `username`: 认证用户名
      - `password`: 认证密码
      - `status`: 代理状态
      - `created_at`: 创建时间
      - `updated_at`: 更新时间
      - `deleted_at`: 软删除时间

15. **`tls_fingerprint_profiles` (TLS 指纹配置表)**
    - **说明**: 模拟真实浏览器底层网络特征绕过WAF。
    - **字段解释**:
      - `id`: 主键ID
      - `name`: 指纹模板名称
      - `description`: 描述
      - `enable_grease`: 是否启用 GREASE 扩展
      - `cipher_suites`: 加密套件列表 (影响 JA3)
      - `curves`: 椭圆曲线列表
      - `point_formats`: EC 点格式
      - `signature_algorithms`: 签名算法列表
      - `alpn_protocols`: ALPN 协议 (如 http/1.1)
      - `supported_versions`: 支持的 TLS 版本
      - `key_share_groups`: 密钥共享曲线组
      - `psk_modes`: PSK 密钥交换模式
      - `extensions`: TLS 扩展发送顺序列表
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

16. **`error_passthrough_rules` (错误透传规则表)**
    - **说明**: 决定哪些上游报错应直接抛给用户。
    - **字段解释**:
      - `id`: 主键ID
      - `name`: 规则名
      - `enabled`: 是否启用
      - `priority`: 优先级
      - `error_codes`: 匹配的错误码列表
      - `keywords`: 匹配的报错关键词列表
      - `match_mode`: 匹配模式 (any/all)
      - `platforms`: 适用的上游平台
      - `passthrough_code`: 是否透传原状态码
      - `response_code`: 自定义响应状态码
      - `passthrough_body`: 是否透传原报错信息
      - `custom_message`: 自定义报错文案
      - `skip_monitoring`: 是否跳过监控告警
      - `description`: 描述
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

17. **`security_secrets` (内部安全凭证表)**
    - **说明**: 统一存储系统自身的敏感加密密钥。
    - **字段解释**:
      - `id`: 主键ID
      - `key`: 密钥名称标识
      - `value`: 加密存储的密钥内容
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

### 7.5 扩展功能与内容表 (5张)
18. **`announcements` (系统公告表)**
    - **说明**: 全站系统通知。
    - **字段解释**:
      - `id`: 主键ID
      - `title`: 公告标题
      - `content`: 公告正文 (Markdown)
      - `status`: 状态 (draft/active等)
      - `notify_mode`: 通知模式 (弹窗 popup / 铃铛 silent)
      - `targeting`: 目标人群展示规则 JSON
      - `starts_at`: 开始展示时间
      - `ends_at`: 结束展示时间
      - `created_by`: 发布人
      - `updated_by`: 修改人
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

19. **`announcement_reads` (公告已读状态表)**
    - **说明**: 记录每个用户的公告已读时间。
    - **字段解释**:
      - `id`: 主键ID
      - `announcement_id`: 关联公告ID
      - `user_id`: 用户ID
      - `read_at`: 首次已读时间
      - `created_at`: 记录创建时间

20. **`user_attribute_definitions` (动态属性定义表)**
    - **说明**: 动态增加用户字段（如公司、微信），免改库。
    - **字段解释**:
      - `id`: 主键ID
      - `key`: 属性标识 (如 company_name)
      - `name`: 表单显示名称
      - `description`: 字段描述说明
      - `type`: 字段类型 (text/select/date等)
      - `options`: 下拉框的可选值 JSON
      - `required`: 是否必填
      - `validation`: 校验规则 JSON (正则、最大长度等)
      - `placeholder`: 占位符提示文案
      - `display_order`: 排序
      - `enabled`: 是否启用
      - `created_at`: 创建时间
      - `updated_at`: 更新时间
      - `deleted_at`: 软删除时间

21. **`user_attribute_values` (动态属性值表)**
    - **说明**: 存储用户动态属性的具体填写内容。
    - **字段解释**:
      - `id`: 主键ID
      - `user_id`: 关联用户ID
      - `attribute_id`: 关联属性定义ID
      - `value`: 用户实际填写的文本值
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

22. **`usage_cleanup_tasks` (日志清理任务表)**
    - **说明**: 定期清理/归档海量调用日志的任务。
    - **字段解释**:
      - `id`: 主键ID
      - `status`: 任务执行状态
      - `filters`: 清理条件 JSON
      - `created_by`: 创建人
      - `deleted_rows`: 已清理的行数
      - `error_message`: 失败报错
      - `canceled_by`: 取消人
      - `canceled_at`: 取消时间
      - `started_at`: 开始执行时间
      - `finished_at`: 完成时间
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

### 7.6 中间表与辅助表 (4张)
23. **`account_groups` (渠道分组多对多关联表)**
    - **说明**: 实现渠道与分组的多对多绑定。
    - **字段解释**:
      - `account_id`: 渠道账号ID
      - `group_id`: 分组ID
      - `priority`: 该账号在该分组中的特定调度优先级
      - `created_at`: 绑定时间

24. **`user_allowed_groups` (用户专属分组关联表)**
    - **说明**: 给用户开放隐藏/专属的特殊分组权限。
    - **字段解释**:
      - `user_id`: 用户ID
      - `group_id`: 授权的分组ID
      - `created_at`: 授权时间

25. **`promo_code_usages` (优惠码流水表)**
    - **说明**: 记录通用优惠码使用情况，防重复领。
    - **字段解释**:
      - `id`: 主键ID
      - `promo_code_id`: 优惠码ID
      - `user_id`: 领取的核销用户ID
      - `bonus_amount`: 实际到账金额
      - `used_at`: 领取时间

26. **`idempotency_records` (幂等性记录表)**
    - **说明**: 保证支付回调等高并发操作不被重复执行。
    - **字段解释**:
      - `id`: 主键ID
      - `scope`: 幂等作用域 (如 stripe_webhook)
      - `idempotency_key_hash`: 幂等键哈希值
      - `request_fingerprint`: 请求指纹
      - `status`: 当前处理状态
      - `response_status`: 处理完毕返回的HTTP状态码
      - `response_body`: 处理完毕返回的包体
      - `error_reason`: 异常原因
      - `locked_until`: 并发锁定时长
      - `expires_at`: 记录过期时间
      - `created_at`: 创建时间
      - `updated_at`: 更新时间

---
*(注：上述包含 Ent ORM 生成的 `id` 默认主键，以及通过 `mixins` 自动混入的 `created_at`, `updated_at`, `deleted_at` 时间戳/软删除字段。)*
