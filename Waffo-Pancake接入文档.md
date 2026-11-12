# SubioHub Waffo Pancake 接入文档

> 适用范围：`subiohub`（Go 后端 + `next-web` 前端）
> 支付通道：Waffo Pancake（Merchant of Record，托管收银台）
> 当前代码位置：`backend/internal/payment/provider/waffo.go`
> 最后更新：2026-11-07

---

## 0. 结论与适用范围

SubioHub 当前接入的是 **Waffo Pancake（api.waffo.ai）**，不是 `waffo.com` 的收单 API。

链路模式：

1. 服务端用 API Key（RSA 私钥）调用 Pancake 创建 checkout session；
2. 前端跳转 Waffo 托管收银台；
3. 用户支付完成后，Waffo 回调 `order.completed`；
4. 后端验签、按订单号入账 / 发放订阅 / 生成分润。

Pancake 是 MoR：由 Waffo 以自己名义收款、开票、代缴税费和处理拒付，我们再与 Waffo 结算。

---

## 1. 申请 Waffo 商户前的前置条件

### 1.1 站点合规页面（本项目现状）

| 用途 | 本项目的地址 | 状态 |
| --- | --- | --- |
| 产品网站 | `https://你的前端域名/` | 需部署后可用 |
| 服务条款 | `https://你的前端域名/terms` | 已有 |
| 隐私政策 | `https://你的前端域名/privacy` | 已有 |
| 退款政策 | `https://你的前端域名/refund` | 已有 |
| 联系我们 | `https://你的前端域名/contact` | 已有 |

多语言版本同路径加语言前缀，例如 `/en/privacy`、`/zh-CN/terms`。

法务正文在：

- `next-web/src/components/legal/legal-content.ts`
- `next-web/src/components/legal/legal-view.tsx`

### 1.2 申请填写建议

| 字段 | 建议值 |
| --- | --- |
| 业务类型 | 个人（Individual）或公司主体，按实际 |
| 国家 / 税务居住地 | 按实际主体 |
| 商家 / 商店名称 | `SubioHub` |
| 联系邮箱 | **必须换成真实可收信邮箱** |
| 产品类别 | 数字产品 / 在线服务 |
| 业务描述 | AI API gateway / digital API quota and subscription service |

注意事项：

- 产品类别不要选实体商品、物流、票务等类目。
- 业务描述要与站点 `/terms` 一致：在线数字服务，不涉及实体交付。
- 审核会看退款政策与经营主体，页脚建议展示运营主体信息（当前项目尚未补，提交前需要补上）。

### 1.3 审核通过后需要拿到

| 值 | 从哪里拿 | 用途 |
| --- | --- | --- |
| `MER_xxx` | Waffo Dashboard | 请求头 `X-Merchant-Id` |
| API Key | Dashboard → API & Development → Create API key | 请求签名（RSA 私钥，PEM/Base64） |
| Webhook Public Key | Dashboard → Settings → Webhooks | 回调验签 |
| `PROD_xxx` | Dashboard → Products | 创建 checkout session 的 `productId` |

Test / Production 是两套独立 Key 和公钥，不能混用。

---

## 2. SubioHub 后台配置

### 2.1 添加 Waffo 服务商实例

进入：**管理后台 → 设置 → 支付设置 → 支付服务商实例 → 添加支付服务商**，服务商类型选择 `Waffo`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `merchantId` | 是 | `MER_xxx` |
| `privateKey` | 是 | API Key / 商户 RSA 私钥，支持 PEM 或 Base64 |
| `webhookPublicKey` | 是 | Waffo Dashboard 的 Webhook Public Key，支持 PEM 或 Base64 |
| `productId` | 是 | `PROD_xxx`，建议用一个通用的一次性数字服务产品 |
| `currency` | 否 | 默认 `USD` |
| `rate` | 否 | `1 USD = ? currency`，默认 `1` |
| `taxCategory` | 否 | 默认 `saas` |
| `taxIncluded` | 否 | 默认 `true`，即站内显示价即到手价 |
| `successUrl` | 否 | 支付完成后跳转地址，必须是绝对 `https://` 地址 |
| `language` | 否 | 收银台语言，如 `zh-Hans`、`en` |
| `expiresInSeconds` | 否 | checkout session 有效期，默认由 Waffo 控制 |

建议 `successUrl` 先填：

```text
https://你的前端域名/dashboard/orders
```

说明：项目里虽然定义了 `PAYMENT_RESULT_PATH = '/payment/result'`，但目前没有对应的 `payment/result` 页面，直接填会 404。

保存后，后台会显示 Waffo Webhook 地址：

```text
https://你的后端域名/api/v1/payment/webhook/waffo
```

### 2.2 Waffo Dashboard 配置

1. 创建 / 确认一个一次性产品（One-time Product），Publish 到对应环境；
2. 记录产品 ID（`PROD_xxx`），填入 SubioHub 的 `productId`；
3. Settings → Webhooks 新建 HTTP Webhook：
   - URL：`https://你的后端域名/api/v1/payment/webhook/waffo`
   - **FORMAT：`RAW`（不是 JSON）**
   - 环境：Test 或 Production
   - 事件：至少订阅 `order.completed`
4. 复制对应的 Webhook Public Key，填入 SubioHub 的 `webhookPublicKey`；
5. 确认产品已 Publish，否则收银台不可用。

> **FORMAT 必须选 `RAW`**：Waffo 会把 JSON 字符串直接作为原始 body 发送，不做外层 JSON 包装或模板渲染。
> 本项目按原始 body 做 RSA-SHA256 验签；如果后台选成 JSON 格式化/模板格式，body 被改写后签名必然对不上，回调会 401。

产品基准价建议设置为最低真实价格；实际金额由 `priceSnapshot` 在创建会话时覆盖，避免 `priceSnapshot` 失效时多收。

---

## 3. 支付链路

```text
用户充值 / 购买套餐
        │
        ▼
POST /api/v1/payment/orders
        │
        ▼
PaymentService.CreateOrder
        │  选择 Waffo 实例（负载均衡）
        ▼
Waffo.CreatePayment
        │  POST https://api.waffo.ai/v1/actions/checkout/create-session
        │  priceSnapshot = 实际应付金额
        ▼
返回 checkoutUrl
        │
        ▼
前端打开 Waffo 托管收银台
        │
        ▼
用户完成支付
        │
        ▼
Waffo → POST /api/v1/payment/webhook/waffo
        │  验签 + 解析 order.completed
        ▼
PaymentService.HandlePaymentNotification
        │
        ├─ 余额订单：按 USD baseAmount 入账
        ├─ 订阅订单：发放 / 续期订阅
        └─ 分润：写 commission_split_logs / commission_logs
```

---

## 4. 技术实现

### 4.1 创建 checkout session

请求：

```http
POST /v1/actions/checkout/create-session
Content-Type: application/json
X-Merchant-Id: MER_xxx
X-Timestamp: <unix 秒>
X-Signature: <base64(RSA-SHA256(canonical))>
```

签名串：

```text
canonical = "POST\n/v1/actions/checkout/create-session\n<timestamp>\n" + base64(sha256(rawBody))
```

请求体示例：

```json
{
  "productId": "PROD_xxx",
  "currency": "USD",
  "priceSnapshot": {
    "amount": "7.50",
    "taxIncluded": true,
    "taxCategory": "saas"
  },
  "buyerEmail": "user@example.com",
  "successUrl": "https://你的前端域名/dashboard/orders",
  "expiresInSeconds": 3600,
  "metadata": {
    "order_id": "sub2_xxx",
    "user_id": "42"
  },
  "orderMerchantExternalId": "sub2_xxx",
  "language": "zh-Hans"
}
```

响应示例：

```json
{
  "data": {
    "sessionId": "cs_xxx",
    "checkoutUrl": "https://pancake.waffo.ai/store/xxx/checkout/cs_xxx",
    "expiresAt": "2026-11-08T00:00:00Z"
  }
}
```

SubioHub 将 `checkoutUrl` 作为 `pay_url` 返回给前端，`sessionId` 记录为支付交易号。

### 4.2 回调验签

Waffo 请求头：

```text
X-Waffo-Signature: t=<timestamp>,v1=<signature>
```

验签规则：

1. 解析 `t`、`v1`；
2. 时间戳支持秒 / 毫秒；允许过去 45 分钟、未来 1 分钟；
3. 优先验证签名串 `<t>.<rawBody>`，兼容验证 `<rawBody>`；
4. 签名值支持 base64 / base64url / hex；
5. 使用 `webhookPublicKey` 做 RSA-SHA256 验签；
6. 必须使用原始 body，不能解析 JSON 后再重新序列化。

> Waffo 后台 Webhook 的 `FORMAT` 必须是 `RAW`。body 内容本身仍是 JSON 字符串，但 Waffo 不会做外层 JSON 包装；代码只读取原始 body 字符串参与验签。

本项目处理的事件：

- `order.completed`：支付成功，进入入账流程
- 其他事件：返回 200，不处理

关键字段：

| 字段 | 用途 |
| --- | --- |
| `data.orderMerchantExternalId` | 对应 SubioHub 的 `out_trade_no` |
| `data.orderMetadata.order_id` | 兜底订单号 |
| `data.paymentId` | Waffo 支付流水号 |
| `data.chargedAmount` | 实际扣款金额（优先） |
| `data.amount` / `data.listPrice.total` | 金额兜底 |
| `data.paymentStatus` / `data.orderStatus` | 成功判定 |

金额校验：

- `chargedAmount` 会换算回 USD 后，与本地订单 `PayAmount` 比较；
- 默认 `taxIncluded=true`，站内显示价即实际扣款，避免含税后金额不一致；
- 如果改成 `taxIncluded=false`，含税金额可能高于本地 `PayAmount`，会导致金额校验失败。

### 4.3 代码落点

| 层 | 文件 | 说明 |
| --- | --- | --- |
| Provider | `backend/internal/payment/provider/waffo.go` | 下单、签名、回调验签、金额换算 |
| 类型 | `backend/internal/payment/types.go` | `TypeWaffo` |
| 工厂 | `backend/internal/payment/provider/factory.go` | 创建 Waffo Provider |
| 实例校验 | `backend/internal/service/payment_config_providers.go` | `validProviderKeys` |
| 下单 | `backend/internal/service/payment_order.go` | 传递用户 ID / 邮箱 |
| 币种 | `backend/internal/service/exchange_rate_service.go` | Waffo 归为 USD |
| 回调 | `backend/internal/handler/payment_webhook_handler.go` | `WaffoWebhook`、订单号提取 |
| 路由 | `backend/internal/server/routes/payment.go` | `POST /api/v1/payment/webhook/waffo` |
| 后台配置 | `next-web/src/lib/payment-provider-config.ts` | Waffo 字段定义 |
| 后台页面 | `next-web/src/app/admin/settings/page.tsx` | Waffo 实例入口、Webhook 地址展示 |
| 用户侧标签 | `next-web/src/app/dashboard/{finance,orders,plans}/page.tsx` | `Waffo` 展示文案 |

---

## 5. 金额与税务口径

- SubioHub 内部余额与订单结算统一为 USD；
- `CurrencyForPaymentType("waffo")` 返回 `USD`；
- Provider 配置 `currency` 默认 `USD`，`rate` 默认 `1`；
- 若设置 `currency=CNY`、`rate=7.14`，则：
  - 下单金额 = `PayAmount × 7.14`；
  - 回调金额 = Waffo 金额 ÷ `7.14`，再与订单 `PayAmount` 比较；
- `priceSnapshot.amount` 使用该币种的展示格式（USD 两位小数，JPY 等零小数币种不带小数）；
- `taxIncluded=true` 时金额即到手价，推荐保持默认。

---

## 6. 测试联调

### 6.1 测试环境

1. Waffo Dashboard 切换到 Test；
2. 使用 Test API Key 和 Test Webhook Public Key；
3. 创建 Test Webhook，指向本地或测试域名；
4. SubioHub 后台添加一个 Waffo 测试实例；
5. 用测试卡完成一笔小额支付。

Test 与 Production 的 Key / 公钥 / 产品完全独立，切换时必须成套替换。

### 6.2 回调自测

本地可以用生成的 RSA 密钥对自测：

1. 生成一对 RSA 密钥；
2. SubioHub 的 `privateKey` 用测试私钥，`webhookPublicKey` 用测试公钥；
3. 构造 `order.completed` body；
4. 用测试私钥对 `<t>.<body>` 签名；
5. 发送请求头 `X-Waffo-Signature: t=<毫秒>,v1=<base64>` 到 `/api/v1/payment/webhook/waffo`；
6. 检查订单是否从 `PENDING` 变为 `COMPLETED`。

### 6.3 联调检查清单

- [ ] 后台 Waffo 实例保存成功，密钥未报错
- [ ] 创建订单返回 `checkoutUrl`
- [ ] 收银台金额与站内显示金额一致
- [ ] 支付完成后收到 `order.completed`
- [ ] 订单状态变为 `COMPLETED`
- [ ] 余额 / 订阅到账
- [ ] 分销佣金 / 分润记录生成
- [ ] 重复回调不会重复入账

---

## 7. 常见问题排查

| 现象 | 排查方向 |
| --- | --- |
| 创建会话 401 / Invalid signature | 检查 `X-Merchant-Id`、时间戳、canonical 顺序；确认 API Key 与环境匹配；服务器时钟需 NTP 同步 |
| 创建会话 400 / Parameter validation failed | 检查 `productId` 是否属于当前环境、是否已 Publish；`successUrl` 是否为绝对 `https://` |
| 回调 401 | Waffo 后台 Webhook 的 `FORMAT` 误选 JSON（应为 `RAW`）；公钥与 Key 环境不匹配；验签未使用原始 body；时间戳超出 45 分钟 |
| 回调 200 但订单未完成 | 事件不是 `order.completed`；`orderMerchantExternalId` 为空；订单号与本地不一致 |
| 金额不一致 | `taxIncluded` 配置与收银台税费口径不一致；`rate` 配置有误 |
| 收银台金额不对 | `priceSnapshot.amount` 计算错误；`PayAmount` 与预期不符 |
| 后台退款失败 | Pancake 未开放退款 REST API，需在 Waffo Dashboard 退款 |
| 查单接口报错 | Pancake 不提供 REST 查单，以 Webhook 为准；本地订单过期依赖超时任务 |

---

## 8. 当前边界

1. **查单**：Pancake 未提供 REST 查单接口，`QueryOrder` 返回不支持，支付结果以 Webhook 为准。
2. **退款**：Pancake 退款在 Waffo Dashboard 处理，SubioHub 后台的网关退款对 Waffo 不可用。
3. **订阅**：当前只处理 `order.completed`；`subscription.*` 通知忽略，SubioHub 的订阅仍按“一次性支付 + 内部发放订阅”实现。
4. **取消**：Pancake 没有 `cancelUrl`，用户放弃支付后会话到期自动结束，不产生扣款。
5. **结果页**：项目暂无 `/payment/result` 页面，`successUrl` 建议先填 `/dashboard/orders`。
6. **运营主体**：法务页页脚尚未展示运营主体，提交 Waffo 审核前需要补。
7. **联系邮箱**：`legal-content.ts` 中仍是占位邮箱 `support@subio.com`，提交前必须替换。

---

## 9. 上线前检查清单

- [ ] Waffo 商户审核通过
- [ ] 产品已 Publish 到 Production
- [ ] 后台实例已切换为 Production 的 `merchantId` / API Key / Webhook Public Key / Product ID
- [ ] Waffo Webhook 指向生产域名 `/api/v1/payment/webhook/waffo`，并订阅 `order.completed`
- [ ] `successUrl` 为生产前端绝对 https 地址
- [ ] 法务页邮箱与运营主体已替换
- [ ] 小额真实支付验证：创建订单 → 收银台 → 回调 → 入账
- [ ] 验证重复回调幂等
- [ ] 验证余额、订阅、佣金三类入账

---

## 10. 验证命令

后端（`backend` 目录）：

```powershell
gofmt -w internal/payment/provider/waffo.go
go build ./...
go vet ./...
go test ./internal/payment/... ./internal/service/... ./internal/handler/...
```

前端（`next-web` 目录）：

```powershell
npx tsc --noEmit
npx eslint src/lib/payment-provider-config.ts src/app/admin/settings/page.tsx
```

---

## 11. 参考

- Waffo Pancake Dashboard：<https://pancake.waffo.ai/merchant/dashboard>
- Create Checkout Session：<https://docs.waffo.ai/api-reference/endpoints/orders/create-checkout-session>
- Webhooks：<https://docs.waffo.ai/api-reference/webhooks>
- Webhook 验签指南：<https://docs.waffo.ai/guides/webhooks>
