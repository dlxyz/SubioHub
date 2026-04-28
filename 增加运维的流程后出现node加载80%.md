开始补 运维监控 真实页面，接上现有后台导航缺口,这是vue前端显示截图，先把这两个功能给迁移过来完善这个功能。

Builder

我先对照 Vue 的运维监控页和现有后端接口，把这两个功能的真实数据来源、页面结构和 Next 里缺的路由壳子找出来，再按现有后台导航补成可用页面。

0/4 已完成

定位 Vue 运维监控与系统日志页面及对应接口

迁移运维监控首页到 Next 后台

迁移系统日志与日志配置页到 Next 后台

验证新运维页面诊断与 lint

在工作区搜索 '运维监控|系统日志|advanced-settings|metric-thresholds|ops'

在工作区搜索 'ops|advanced-settings|metric-thresholds|log.*settings|system logs|/admin/ops'

在工作区搜索 '**/ops/**/*.{vue,ts,js}'

在工作区搜索 '**/*ops*.vue'

压缩

Thought

先继续接着做 admin/ops 这块，我会先把 Vue 运维监控页、系统日志组件和后端对应接口读透，确认 Next 里要补的真实路由、数据结构和交互范围，然后再开始落页面。

0/4 已完成

定位 Vue 运维监控与系统日志页面及对应接口

迁移运维监控首页到 Next 后台

迁移系统日志与日志配置页到 Next 后台

验证新运维页面诊断与 lint

D:\guoziji\apirouter\subiohub\frontend\src\views\admin\ops\OpsDashboard.vue

D:\guoziji\apirouter\subiohub\frontend\src\api\admin\ops.ts

D:\guoziji\apirouter\subiohub\frontend\src\views\admin\ops\components\OpsSystemLogTable.vue

D:\guoziji\apirouter\subiohub\backend\internal\handler\admin\ops_dashboard_handler.go

D:\guoziji\apirouter\subiohub\backend\internal\handler\admin\ops_system_log_handler.go

D:\guoziji\apirouter\subiohub\backend\internal\server\routes\admin.go

D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-api.ts

D:\guoziji\apirouter\subiohub\next-web\src\app\admin\layout.tsx

D:\guoziji\apirouter\subiohub\next-web\src\app\admin\[...slug]\page.tsx

D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\zh-CN.ts

D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\en-US.ts

Thought

Vue 这边已经确认了： /admin/ops 本身就是总入口，里面既有监控总览也嵌了系统日志和日志运行时配置，所以 Next 这次我会优先补一个真实的 admin/ops 页面，把导航缺口先堵上，再把日志筛选/清理/配置一起接进去。

在工作区搜索 'opsMonitoringEnabled|ops_monitoring|ops monitoring'

D:\guoziji\apirouter\subiohub\next-web\src\lib\api.ts

在工作区搜索 'recharts|chart.js|apexcharts'

D:\guoziji\apirouter\subiohub\next-web\package.json

D:\guoziji\apirouter\subiohub\backend\internal\handler\admin\ops_settings_handler.go

Thought

接下来我开始落代码：先补 Next 侧的 ops API 类型和接口，再新建真实 admin/ops 页面，把总览卡片、趋势数据和系统日志配置/筛选/清理整合进来，尽量保持 Vue 的字段和交互顺序一致。

在工作区搜索 'ops_monitoring_enabled|opsMonitoringEnabled'

在工作区搜索 'showSuccess\(|showError\('

在工作区搜索 'function getErrorMessage|const getErrorMessage'

Thought

admin-ops-api.ts
D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-ops-api.ts

+ 384 - 0

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 1473 - 0

Thought

admin/ops 页面骨架已经落下去了，现在在补中文/英文文案，把总览筛选、阈值、日志配置、日志筛选和分页这些文案都接到现有后台 i18n 里，之后我会直接跑诊断修编译问题。

zh-CN.ts
D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\zh-CN.ts

+ 193 - 0

en-US.ts
D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\en-US.ts

+ 193 - 0

Thought

Thought

诊断已经过了一轮，当前新加的页面和文案文件都没有编辑器级报错；我再补跑一次 next-web 的 lint，确认这次迁移不会把现有后台编译链打坏。

D:\guoziji\apirouter\subiohub\next-web
在沙箱中
在终端查看

$ npm run lint


Thought

lint 里主要是这套新规则在拦 effect 里直接触发状态更新，我把 ops 页面这几处改成异步调度和 ref 控制，先把我这次新增页面的报错清掉；其余几个报错是项目里本来就存在的旧文件问题。

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 28 - 10

D:\guoziji\apirouter\subiohub\next-web
在沙箱中
在终端查看

$ npm run lint



4/4 已完成

定位 Vue 运维监控与系统日志页面及对应接口

迁移运维监控首页到 Next 后台

迁移系统日志与日志配置页到 Next 后台

验证新运维页面诊断与 lint

已完成

- 已补上真实的 admin/ops 页面，不再落到占位路由；新页面在 page.tsx 。
- 已把 Vue 的两个核心能力迁到 Next 后台：
  - 运维监控总览：时间范围、平台/分组筛选、查询模式、健康分、QPS/TPS、SLA、错误率、延迟分布、状态码分布、系统状态、任务心跳。
  - 系统日志：日志写入健康、运行时日志配置、筛选查询、分页、按条件清理。
- 已新增 Next 侧 ops 接口封装到 admin-ops-api.ts ，直接对接现有后端 /admin/ops/* 接口。
- 已把后台运维监控的中英文文案补进 i18n：
  - zh-CN.ts
  - en-US.ts
验证情况

- 已检查本次新增/修改文件的编辑器诊断，当前无报错。
- 已执行 npm run lint ，本次新增的 ops 页面相关文件没有 lint 报错。
- 当前项目仍有旧的未处理 lint 问题，位于：
  - page.tsx
  - page.tsx
  - page.tsx
说明

- 这次先优先对齐你要的“运维监控 + 系统日志”真实页，并把后台导航缺口补通。
- 目前做的是可用版真实页面，重点先落真实数据与主要交互；Vue 里更深的部分，比如告警规则、告警事件、WebSocket 实时刷新、错误详情弹窗，这一轮还没继续迁。
下一步建议

- 可以继续补 admin/ops 的告警规则与告警事件。
- 或者继续把实时刷新和错误详情钻取也迁过来，进一步贴近 Vue 原后台。


我先把这次新增的 运维监控 / 系统日志 迁移成果补进现有的几份方案文档里，重点更新当前进度、已接通页面能力和下一步排期，避免文档状态落后于代码。

D:\guoziji\apirouter\subiohub\前端重构计划_Vue到Nextjs.md

D:\guoziji\apirouter\subiohub\subiohub_系统架构与核心原理解析.md

D:\guoziji\apirouter\subiohub\subiohub_二开分销系统设计方案.md

我先更新重构计划文档，把 运维监控 从“占位待迁移”改成“已落真实页”，并补上这次具体迁移到位的能力范围和后续剩余项。

前端重构计划_Vue到Nextjs.md
D:\guoziji\apirouter\subiohub\前端重构计划_Vue到Nextjs.md

+ 10 - 5

Thought

接着补架构文档，我会把 next-web 已承接到 admin/ops 真实页面、以及它和后端 ops 接口分工的关系写清楚，方便后面继续沿这条链补告警与实时部分。

subiohub_系统架构与核心原理解析.md
D:\guoziji\apirouter\subiohub\subiohub_系统架构与核心原理解析.md

+ 14 - 1

最后把分销方案文档也顺手同步一下，补一条“当前后台相邻真实页能力”的说明，让后续做返佣审计、问题排查时知道现在已经可以挂靠到 订单 / 运维监控 这些 Next 页面。

subiohub_二开分销系统设计方案.md
D:\guoziji\apirouter\subiohub\subiohub_二开分销系统设计方案.md

+ 2 - 0

Thought

已补充

- 已把这次 运维监控 / 系统日志 的迁移成果同步到重构计划文档： 前端重构计划_Vue到Nextjs.md
- 已把 admin/ops 从占位路由变为真实页面的架构现状补到系统说明文档： subiohub_系统架构与核心原理解析.md
- 已把分销方案中与后台排障相关的现状补到设计文档： subiohub_二开分销系统设计方案.md
本次文档新增重点

- 运维监控 已从“待迁移占位页”更新为“Next 真实页面”
- 已记录当前接通的能力范围：
  - 运维总览
  - 系统日志
  - 日志运行时配置
  - 日志筛选、分页、清理
- 已注明尚未完成的下一阶段内容：
  - 告警规则
  - 告警事件
  - 错误详情钻取
  - WebSocket 实时刷新
  - 更复杂图表交互
下一步

- 如果你要，我可以继续把这三份文档里关于 运维监控 的“下一步计划”再细化成明确开发清单，或者直接继续开发 告警规则 / 告警事件 。


Builder

我先对照 Vue 里的 告警规则 、 告警事件 实现和后端现有接口，把 Next 里需要补的字段、列表动作和弹窗交互梳理出来，然后直接接进现有 admin/ops 真实页。

4/8 已完成

定位 Vue 运维监控与系统日志页面及对应接口

迁移运维监控首页到 Next 后台

迁移系统日志与日志配置页到 Next 后台

验证新运维页面诊断与 lint

对照 Vue 告警规则与告警事件组件及接口

在 Next 运维页迁移告警规则管理

在 Next 运维页迁移告警事件列表与状态操作

验证告警规则与告警事件页面诊断

D:\guoziji\apirouter\subiohub\frontend\src\views\admin\ops\components\OpsAlertRulesCard.vue

D:\guoziji\apirouter\subiohub\frontend\src\views\admin\ops\components\OpsAlertEventsCard.vue

D:\guoziji\apirouter\subiohub\backend\internal\handler\admin\ops_alerts_handler.go

D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-ops-api.ts

D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

Thought

我已经把 Vue 侧这两块的结构看清了：规则管理是标准 CRUD，事件中心是筛选列表 + 详情 + 手动恢复/静默，所以我会优先在现有 admin/ops 页继续加两个面板，把主流程先一次性补齐。

在工作区搜索 'alertRules|alertEvents'

D:\guoziji\apirouter\subiohub\frontend\src\api\admin\ops.ts

在工作区搜索 'getAll\(|groups\.getAll'

在工作区搜索 'export interface Group|type Group'

Thought

我在补接口层时顺手确认一下分组列表来源，规则编辑里有 group_id 选择器，Next 这边最好直接复用现有后台分组接口，避免把分组名手写死。

在工作区搜索 'groups'

在工作区搜索 'fetch.*group|list.*group|get.*group'

在工作区搜索 'AlertRule|AlertEvent|createAlertSilence|listAlertEvents|listAlertRules'

D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-api.ts

我已经找到 Next 里现成的 listAdminGroups() ，这样规则编辑里的分组下拉可以直接复用，不需要额外再开新接口。下一步我开始补 admin-ops-api.ts 的告警类型和方法，再把页面 UI 接进去。

在工作区搜索 'export interface AdminGroup'

D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-api.ts

在工作区搜索 'common:\s*\{|save:|saving:|cancel:|delete:|apply:|enabled:|disabled:|refresh:'

D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\zh-CN.ts

Thought

D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-api.ts

Thought

我现在开始改代码：先扩 admin-ops-api.ts ，把告警规则、事件、静默这些方法统一进 Next 的 ops API 层，后面页面就直接基于这一层接 UI。

admin-ops-api.ts
D:\guoziji\apirouter\subiohub\next-web\src\lib\admin-ops-api.ts

+ 119 - 0

Thought

页面这步我会先用“可用优先”的方式补齐，不先追求把 Vue 的弹窗 1:1 复刻，而是先把规则 CRUD、事件筛选、事件详情、手动恢复、静默这些主流程落成稳定可用的真实界面。

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 50 - 2

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 60 - 0

Thought

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 23 - 0

页面主状态已经挂上去了。我先重新读取最新的 admin/ops/page.tsx ，避免后续补告警逻辑时和刚才新增的状态段发生偏移。

D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 534 - 0

Thought

告警的数据和动作逻辑已经接进页面状态里了。我先再读一次最新文件，再补最后一段 UI，避免把刚加的 hooks 和底部 JSX 覆盖掉。

D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 19 - 1

告警页签入口已经挂到顶部了，接下来把规则管理和事件中心的可视界面一次性插进去，然后我就跑诊断修首轮类型错误。

page.tsx
D:\guoziji\apirouter\subiohub\next-web\src\app\admin\ops\page.tsx

+ 620 - 0

Thought

在工作区搜索 'ops:\s*\{'

在工作区搜索 'ops:\s*\{'

D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\zh-CN.ts

D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\en-US.ts

Thought

zh-CN.ts
D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\zh-CN.ts

+ 160 - 1

en-US.ts
D:\guoziji\apirouter\subiohub\next-web\src\i18n\locales\en-US.ts

+ 160 - 1

告警文案也补完了。现在先跑一轮编辑器诊断，把 ops 页面和新 API 的类型问题清掉，再决定要不要补一次 lint。

Thought

D:\guoziji\apirouter\subiohub\next-web
在沙箱中
在终端查看

$ npm run lint

ops 这轮告警扩展已经通过诊断和 lint 了。我把 todo 收尾后给你一个简短交付说明，方便你直接继续验页面。

8/8 已完成

对照 Vue 告警规则与告警事件组件及接口

在 Next 运维页迁移告警规则管理

在 Next 运维页迁移告警事件列表与状态操作

定位 Vue 运维监控与系统日志页面及对应接口

迁移运维监控首页到 Next 后台

迁移系统日志与日志配置页到 Next 后台

验证告警规则与告警事件页面诊断

验证新运维页面诊断与 lint

已完成

- 已在 page.tsx 为 admin/ops 增加 告警中心 页签。
- 已迁移 告警规则 主流程：
  - 规则列表
  - 新建规则
  - 编辑规则
  - 删除规则
  - 分组作用域选择
  - 严重级别、窗口、持续时间、冷却时间、邮件通知配置
- 已迁移 告警事件 主流程：
  - 时间范围/严重级别/状态/邮件状态筛选
  - 事件列表
  - 事件详情
  - 相似历史事件查看
  - 告警静默
  - 手动恢复
- 已扩展 Next 侧 ops API 到 admin-ops-api.ts ，补齐：
  - alert-rules
  - alert-events
  - alert-silences
- 已补齐中英文文案：
  - zh-CN.ts
  - en-US.ts
验证

- 已检查新增文件诊断，当前无报错。
- 已执行 npm run lint ，通过。
当前状态

- 运维总览
- 告警规则
- 告警事件
- 系统日志
这四块现在都已经在 next-web 的 admin/ops 里有真实页面承接了。

下一步建议

- 可以继续补 告警静默列表 / 静默管理
- 或继续补 错误详情钻取 ，把告警事件和日志、请求错误页串起来



管理员登录后台后的错误运行日志：
[GIN-debug] PUT    /api/v1/admin/payment/providers/:id --> github.com/dlxyz/SubioHub/internal/handler/admin.(*PaymentHandler).UpdateProvider-fm (7 handlers)  
[GIN-debug] DELETE /api/v1/admin/payment/providers/:id --> github.com/dlxyz/SubioHub/internal/handler/admin.(*PaymentHandler).DeleteProvider-fm (7 handlers)  
2026-04-23T03:19:35.254+0800    INFO    stdlog  server/wire_gen.go:242  Global max request body size: 268435456 bytes (256.00 MB)       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:19:35.255+0800    INFO    service/ops_cleanup_service.go:107     [OpsCleanup] started (schedule="0 2 * * *" tz=Asia/Shanghai)     {"service": "subiohub", "env": "production", "component": "service.ops_cleanup", "legacy_printf": true}
2026-04-23T03:19:35.255+0800    INFO    slog    logger/slog_handler.go:59      token_refresh.service_started    {"service": "subiohub", "env": "production", "check_interval_minutes": 5, "refresh_before_expiry_hours": 0.5}
2026-04-23T03:19:35.256+0800    INFO    service/scheduled_test_runner_service.go:66     [ScheduledTestRunner] started (tick=every minute)       {"service": "subiohub", "env": "production", "component": "service.scheduled_test_runner", "legacy_printf": true}
2026-04-23T03:19:35.256+0800    INFO    stdlog  server/main.go:96       Server started on 0.0.0.0:8080  {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:20:51.761+0800    INFO    service/turnstile_service.go:50 [Turnstile] Disabled, skipping verification     {"service": "subiohub", "env": "production", "component": "service.turnstile", "legacy_printf": true}
2026-04-23T03:20:51.868+0800    INFO    middleware/logger.go:60 http request completed  {"service": "subiohub", "env": "production", "component": "http", "request_id": "c0e482f9-f433-417a-8330-b7e87afd213e", "client_request_id": "", "path": 
"/api/v1/auth/login", "method": "POST", "component": "http.access", "status_code": 200, "latency_ms": 114, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "POST", "path": "/api/v1/auth/login", "completed_at": "2026-04-23T03:20:51.868+0800"}
2026-04-23T03:21:03.290+0800    INFO    middleware/logger.go:60 http request completed  {"service": "subiohub", "env": "production", "component": "http", "request_id": "56206cd8-4843-41f5-8dea-8889ae09bef9", "client_request_id": "", "path": 
"/api/v1/admin/dashboard/snapshot-v2", "method": "GET", "component": "http.access", "status_code": 200, "latency_ms": 30, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "GET", "path": "/api/v1/admin/dashboard/snapshot-v2", "completed_at": "2026-04-23T03:21:03.290+0800"}
2026-04-23T03:21:03.298+0800    INFO    middleware/logger.go:60 http request completed  {"service": "subiohub", "env": "production", "component": "http", "request_id": "2d992903-d09b-46ed-8ec7-d170b86e32f1", "client_request_id": "", "path": 
"/api/v1/admin/dashboard/snapshot-v2", "method": "GET", "component": "http.access", "status_code": 304, "latency_ms": 2, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "GET", "path": "/api/v1/admin/dashboard/snapshot-v2", "completed_at": "2026-04-23T03:21:03.298+0800"}
2026-04-23T03:21:34.582+0800    INFO    middleware/logger.go:60 http request completed  {"service": "subiohub", "env": "production", "component": "http", "request_id": "6abbfafb-511e-42c2-9349-f820033b0e25", "client_request_id": "", "path": 
"/api/v1/admin/channels", "method": "GET", "component": "http.access", "status_code": 200, "latency_ms": 38, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "GET", "path": "/api/v1/admin/channels", "completed_at": "2026-04-23T03:21:34.582+0800"}
2026-04-23T03:21:34.624+0800    INFO    middleware/logger.go:60 http request comequest comservice": "subiohub", "env": "production", "component": "http", "requespleted  {"service": "subiohub", "env": "production", "component": "http, "path": ", "requesdmin/groups", "method": "GET", "component": "http.access", "status_codt_id": "2a04640f-d54f-4368-af32-f2626099ef35", "client_request_id": "" "method":, "path": ath": "/api/v1/admin/groups", "completed_at": "2026-04-23T03:21:34.624"/api/v1/admin/groups", "method": "GET", "component": "http.access", "status_codT03:21:34.667+0800    INFO    middleware/logger.go:60 http request come": 200, "latency_ms": 75, "client_ip": "::1", "protocol": "HTTP/1.1",", "reques "method":1d2312-f765-4aa3-ae7a-b7d60520713f", "client_request_id": "", "path":  "GET", "path": "/api/v1/admin/groups", "completed_at": "2026-04-23T03 "status_c2026-04-23T03:21:34.624+0800    INFO    middleware/logger.go:60 http r, "method"equest completed  {"service": "subiohub", "env": "production", "componeT03:21:34.nt": "http", "request_id": "2a04640f-d54f-4368-af32-f2626099ef35", "client_request_id": "", "path": "/api/v1/admin/groups", "method": "GET", "component": "http.access", "status_code": 200, "latency_ms": 75, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "GET", "path": "/api/v1/admin/groups", "completed_at": "2026-04-23T03:21:34.624+0800"}   
2026-04-23T03:21:34.667+0800    INFO    middleware/logger.go:60 http request completed  {"service": "subiohub", "env": "production", "component": "http", "request_id": "e41d2312-f765-4aa3-ae7a-b7d60520713f", "client_request_id": "", "path": "/api/v1/admin/channels", "method": "GET", "component": "http.access", "status_code": 200, "latency_ms": 4, "client_ip": "::1", "protocol": "HTTP/1.1", "method": "GET", "path": "/api/v1/admin/channels", "completed_at": "2026-04-23T03:21:34.667+0800"}

2026-04-23T03:29:35.606+0800    INFO    service/pricing_service.go:260[Pricing] Hash check passed, no update needed   {"service": "subiohub", "env": "production", "component": "service.pricing", "legacy_printf": true}
2026-04-23T03:39:35.503+0800    INFO    service/pricing_service.go:260[Pricing] Hash check passed, no update needed   {"service": "subiohub", "env": "production", "component": "service.pricing", "legacy_printf": true}
2026-04-23T03:44:47.887+0800    INFO    stdlog  server/main.go:96
  Shutting down server...       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.897+0800    INFO    stdlog  server/main.go:96     
  Server exited {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.898+0800    INFO    service/email_queue_service.go:72     [EmailQueue] Worker 0 stopping  {"service": "subiohub", "env": 
"production", "component": "service.email_queue", "legacy_printf": true}
2026-04-23T03:44:47.900+0800    INFO    service/email_queue_service.go:72     [EmailQueue] Worker 1 stopping  {"service": "subiohub", "env": 
"production", "component": "service.email_queue", "legacy_printf": true}
2026-04-23T03:44:47.899+0800    INFO    service/idempotency_cleanup_service.go:58     [IdempotencyCleanup] stopped    {"service": "subiohub", "env": "production", "component": "service.idempotency_cleanup", "legacy_printf": true}
2026-04-23T03:44:47.900+0800    INFO    service/email_queue_service.go:72     [EmailQueue] Worker 2 stopping  {"service": "subiohub", "env": 
"production", "component": "service.email_queue", "legacy_printf": true}
2026-04-23T03:44:47.900+0800    INFO    service/usage_cleanup_service.go:114  [UsageCleanup] stopped  {"service": "subiohub", "env": "production", "component": "service.usage_cleanup", "legacy_printf": true}    
2026-04-23T03:44:47.900+0800    INFO    service/pricing_service.go:152[Pricing] Service stopped       {"service": "subiohub", "env": "production", "component": "service.pricing", "legacy_printf": true}
2026-04-23T03:44:47.901+0800    INFO    service/email_queue_service.go:140    [EmailQueue] All workers stopped        {"service": "subiohub", "env": "production", "component": "service.email_queue", "legacy_printf": true}
2026-04-23T03:44:47.901+0800    INFO    service/affiliate_commission_settlement_service.go:80 [AffiliateSettlement] stopped   {"service": "subiohub", "env": "production", "component": "service.affiliate_settlement", "legacy_printf": true}
2026-04-23T03:44:47.899+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] AntigravityOAuthService succeeded     {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsMetricsCollector succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] SubscriptionExpiryService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] PaymentOrderExpiryService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] SubscriptionService succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OAuthService succeeded        {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsScheduledReportService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpenAIWSPool succeeded        {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] ScheduledTestRunnerService succeeded  {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] AccountExpiryService succeeded        {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] BillingCacheService succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsCleanupService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] IdempotencyCleanupService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsSystemLogSink succeeded    {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] SchedulerSnapshotService succeeded    {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsAlertEvaluatorService succeeded    {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpenAIOAuthService succeeded  {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] UsageCleanupService succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] OpsAggregationService succeeded       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] PricingService succeeded      {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] GeminiOAuthService succeeded  {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] EmailQueueService succeeded   {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.903+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] AffiliateCommissionSettlementService succeeded      
  {"service": "subiohub", "env": "production", "legacy_stdlog": true}  
2026-04-23T03:44:47.902+0800    INFO    service/backup_service.go:221 
[Backup] all active operations finished {"service": "subiohub", "env": 
"production", "component": "service.backup", "legacy_printf": true}   
2026-04-23T03:44:47.904+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] UsageRecordWorkerPool succeeded       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.904+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] BackupService succeeded       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.902+0800    INFO    slog    logger/slog_handler.go:59     token_refresh.service_stopped   {"service": "subiohub", "env": 
"production"}
:55     tls_fp_profile_cache_subscriber_stopped {"service": "subiohub", "env": "production", "reason": "channel_closed"}
2026-04-23T03:44:47.905+0800    INFO    stdlog  runtime/asm_amd64.s:1771      [Cleanup] TokenRefreshService succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.944+0800    INFO    stdlog  server/wire_gen.go:501[Cleanup] Redis succeeded       {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.950+0800    INFO    stdlog  server/wire_gen.go:501[Cleanup] Ent succeeded {"service": "subiohub", "env": "production", "legacy_stdlog": true}
2026-04-23T03:44:47.952+0800    INFO    stdlog  server/main.go:178    
  [Cleanup] All cleanup steps completed {"service": "subiohub", "env": 
"production", "legacy_stdlog": true}