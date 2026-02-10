/**
 * Service 层 Transform 模式 — 完整用法示例
 *
 * 演示如何在 API 函数中使用 .then(transform) 模式，
 * 使组件层完全不需要关心后端字段差异。
 */
import type {
  BackendOrderInfo,
  OrderForm,
  OrderInfo,
  PageParams,
  PageResponse,
} from './types.js'
import { toBackendParams, transformOrder } from './types.js'

// ============================================================
// 模拟 request 函数（实际项目中由 axios/fetch 封装提供）
// ============================================================

interface RequestConfig {
  url: string
  method: 'get' | 'post' | 'put' | 'delete'
  params?: Record<string, unknown>
  data?: unknown
}

declare function request<T>(config: RequestConfig): Promise<T>

// ============================================================
// API 函数 — 查询方向：后端 → 前端
// ============================================================

/**
 * 获取订单列表
 *
 * 关键：.then() 中使用 transformOrder 将 BackendOrderInfo 转为 OrderInfo
 * 组件拿到的就是 PageResponse<OrderInfo>，完全是前端类型
 */
export function getOrderList(query: PageParams & { keyword?: string }) {
  return request<PageResponse<BackendOrderInfo>>({
    url: '/api/order/page',
    method: 'get',
    params: query,
  }).then(res => ({
    ...res,
    rows: res.rows.map(transformOrder),
  })) satisfies Promise<PageResponse<OrderInfo>>
}

/**
 * 获取单个订单详情
 */
export function getOrderDetail(id: string) {
  return request<BackendOrderInfo>({
    url: `/api/order/${id}`,
    method: 'get',
  }).then(transformOrder)
}

// ============================================================
// API 函数 — 提交方向：前端 → 后端
// ============================================================

/**
 * 创建订单
 *
 * 关键：提交前用 toBackendParams 将前端表单数据转为后端格式
 */
export function createOrder(form: OrderForm) {
  return request<{ id: string }>({
    url: '/api/order/create',
    method: 'post',
    data: toBackendParams(form),
  })
}

/**
 * 更新订单
 */
export function updateOrder(id: string, form: OrderForm) {
  return request<void>({
    url: `/api/order/${id}`,
    method: 'put',
    data: toBackendParams(form),
  })
}
