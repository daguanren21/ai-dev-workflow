# Service Layer Transform

> Optional specialized reference. Load only when the approved plan must reconcile frontend Mock contracts with backend API contracts. This pattern is not a default harness phase and does not authorize implementation by itself.

The current user stories, passing coverage report, approved plan, and repository conventions take precedence over this example.

## Problem

Frontend uses Mock data during development. On integration, backend fields differ in three ways:

| Difference | Mock (Frontend) | Backend (Actual) |
|-----------|----------------|-----------------|
| Field name | `orderNo` | `order_id` |
| Structure | `{ carrier: "UPS" }` | `{ carrier: { code: "UPS", name: "..." } }` |
| Data format | `status: "Canceled"` | `status: 3` |

## Solution: Transform in Service Layer

When the consuming project uses this pattern, keep transform functions inside service files instead of creating a separate `adapters/` directory. Components consume the stable frontend contract.

```
Component → FrontendType ← service function return type
                ↑
                │ transform
                │
          BackendType
```

**Core principle:** `FrontendType` is the contract between service and component layers. Components only know the contract.

## File Structure

```
src/api/{module}/
├── types.ts       # FrontendType + BackendType + transform functions
├── mock.ts        # Mock data (dev phase)
└── {module}.ts    # API functions (with .then(transform))
```

## Implementation Pattern

```typescript
// 1. Frontend type (component contract)
export interface OrderInfo {
  orderId: string
  carrier: string
  amount: number
  status: string
}

// 2. Backend type (added during integration)
interface BackendOrderInfo {
  order_id: string
  carrier_info: { code: string; name: string }
  amount: string       // cents as string
  status: number       // numeric enum
}

// 3. Transform function
const STATUS_MAP: Record<number, string> = {
  1: 'Pending', 2: 'Shipped', 3: 'Canceled',
}

function transformOrder(raw: BackendOrderInfo): OrderInfo {
  return {
    orderId: raw.order_id,                       // field rename
    carrier: raw.carrier_info.code,              // flatten structure
    amount: Number(raw.amount) / 100,            // format conversion
    status: STATUS_MAP[raw.status] ?? 'Unknown', // enum mapping
  }
}

// 4. Query: backend to frontend
export function getOrderList(query: PageParams) {
  return request<PageResponse<BackendOrderInfo>>({
    url: '/api/order/page',
    params: query,
  }).then(res => ({
    ...res,
    rows: res.rows.map(transformOrder),
  }))
}

// 5. Submit: frontend to backend
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

## Integration Flow

```
Backend ready -> Add BackendType -> Write transform -> Add `.then(transform)` -> Keep the component contract stable
```

## When Components Must Change

| Scenario | Handling |
|----------|---------|
| Backend adds field that UI needs to show | Extend FrontendType + component |
| Business semantics change | Update transform + component logic |
| Pagination structure differs (`rows` → `records`) | Handle in transform |
