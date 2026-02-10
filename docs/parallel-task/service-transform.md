# Service 层 Transform 适配方案

> 解决前端 Mock 与后端实际字段差异的推荐方案

---

## 问题场景

前端使用 Mock 先行开发，联调时后端字段存在三类差异：

| 差异类型 | Mock（前端） | Backend（实际） |
|---------|-------------|----------------|
| 字段名不同 | `orderNo` | `order_id` |
| 结构不同 | `{ carrier: "UPS" }` | `{ carrier: { code: "UPS", name: "..." } }` |
| 数据格式不同 | `status: "已取消"` | `status: 3` |

## 方案：Service 层 Transform

> **不引入独立的 `adapters/` 目录。** 在 service 文件中内置 transform 函数，改动集中、组件零修改。

```
                    不变                          不变
组件层 ──────────→ FrontendType ←──────────── service 函数返回类型
                      ↑
                      │ transform 在这里转换
                      │
               BackendType
               (后端实际返回的结构)
```

**核心原则：`FrontendType` 是 service 层和组件层之间的契约，组件只认契约，不关心后端原始结构。**

## 文件结构

```
src/api/{模块名}/
├── types.ts              # 前端类型 + 后端类型 + transform 函数
├── mock.ts               # Mock 数据（开发阶段）
└── {模块名}.ts            # API 函数（内含 .then(transform)）
```

## 实现步骤

### 1. 定义前端类型（Mock 阶段）

```typescript
// ① 前端类型 — 组件使用的契约，保持不变
export interface OrderInfo {
  orderId: string
  carrier: string
  trackingNo: string
  amount: number
  status: string
  createdAt: string
}
```

### 2. 联调时补充后端类型

```typescript
// ② 后端类型 — 根据后端文档补上
interface BackendOrderInfo {
  order_id: string
  carrier_info: { code: string; name: string }
  tracking_number: string
  amount: string              // 分为单位的字符串
  status: number              // 数字枚举
  created_at: string
}
```

### 3. 编写 transform 函数

```typescript
// ③ transform — 三类差异集中处理
const STATUS_MAP: Record<number, string> = {
  1: 'Pending',
  2: 'Shipped',
  3: 'Canceled',
}

function transformOrder(raw: BackendOrderInfo): OrderInfo {
  return {
    orderId: raw.order_id,                       // 字段名映射
    carrier: raw.carrier_info.code,              // 结构扁平化
    trackingNo: raw.tracking_number,             // 字段名映射
    amount: Number(raw.amount) / 100,            // 格式转换（分→元）
    status: STATUS_MAP[raw.status] ?? 'Unknown', // 枚举映射
    createdAt: raw.created_at,                   // 字段名映射
  }
}
```

### 4. API 函数加 .then(transform)

```typescript
// ④ 查询方向：后端 → 前端
export function getOrderList(query: PageParams) {
  return request<PageResponse<BackendOrderInfo>>({
    url: '/api/order/page',
    method: 'get',
    params: query,
  }).then(res => ({
    ...res,
    rows: res.rows.map(transformOrder),
  }))
}

// ⑤ 提交方向：前端 → 后端
function toBackendParams(form: OrderForm): BackendOrderForm {
  return {
    order_id: form.orderId,
    amount: String(form.amount * 100),
  }
}

export function createOrder(form: OrderForm) {
  return request({
    url: '/api/order/create',
    method: 'post',
    data: toBackendParams(form),
  })
}
```

## 联调操作流程

```
1. 后端接口就绪 → 查看实际返回结构
        ↓
2. 补上 BackendType 类型定义
        ↓
3. 编写 transform 函数：
   - 字段重命名:     raw.order_id → orderId
   - 结构扁平化:     raw.carrier_info.code → carrier
   - 格式转换:       Number(raw.amount) / 100 → amount
   - 枚举映射:       STATUS_MAP[raw.status] → status
        ↓
4. API 函数加 .then(transform)
        ↓
5. 组件层不动，联调完成 ✅
```

## 需要改组件的例外场景

| 场景 | 说明 | 处理方式 |
|-----|------|---------|
| 后端新增字段且 UI 需展示 | Mock 阶段未预见 | 扩展 FrontendType + 组件 |
| 业务语义变更 | 如一个字段拆成两个 | 改 transform + 组件逻辑 |
| 分页结构不同 | 如 `rows` → `records` | 在 transform 中处理 |

## 方案对比

| 方案 | 改动范围 | 适用场景 |
|-----|---------|---------|
| 全局替换字段名 | service + 所有组件 + 模板 | 差异很小（1-2 个字段名） |
| **Service 层 transform（推荐）** | **只改 service 文件** | **差异较大** |
| 独立 adapters/ 适配层 | 新建目录和文件 | 字段频繁变动的长期项目 |
