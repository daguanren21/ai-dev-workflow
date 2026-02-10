/**
 * Service 层 Transform 模式 — 通用类型定义
 *
 * 核心概念：
 * - FrontendType：组件层使用的契约类型，不随后端变化
 * - BackendType：后端实际返回的结构
 * - transform：将 BackendType 转换为 FrontendType
 * - toBackendParams：将前端表单数据转换为后端接收格式
 */

// ============================================================
// 通用分页类型
// ============================================================

/** 分页请求参数 */
export interface PageParams {
  page: number
  pageSize: number
}

/** 分页响应 — 前端统一使用此结构 */
export interface PageResponse<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

// ============================================================
// 示例：订单模块
// ============================================================

/**
 * ① FrontendType — 组件使用的契约
 *
 * 这是组件层和 service 层之间的约定：
 * - 组件只认这个类型
 * - 字段名用 camelCase
 * - 数值类型是 number（不是字符串）
 * - 枚举值是可读字符串（不是数字码）
 */
export interface OrderInfo {
  orderId: string
  carrier: string
  trackingNo: string
  amount: number       // 单位：元
  status: string       // 'Pending' | 'Shipped' | 'Canceled'
  createdAt: string    // ISO 8601
}

/**
 * ② BackendType — 后端实际返回结构
 *
 * 联调时根据后端文档/Postman 补上：
 * - 字段名用 snake_case
 * - 嵌套结构（carrier_info 是对象不是字符串）
 * - 金额是分为单位的字符串
 * - 状态是数字枚举
 */
export interface BackendOrderInfo {
  order_id: string
  carrier_info: { code: string; name: string }
  tracking_number: string
  amount: string       // 分为单位的字符串
  status: number       // 1=Pending, 2=Shipped, 3=Canceled
  created_at: string
}

/**
 * ③ 状态枚举映射表
 */
export const STATUS_MAP: Record<number, string> = {
  1: 'Pending',
  2: 'Shipped',
  3: 'Canceled',
}

/**
 * ④ transform 函数 — 三类差异集中处理
 *
 * 处理的差异类型：
 * - 字段重命名：order_id → orderId
 * - 结构扁平化：carrier_info.code → carrier
 * - 格式转换：分→元，数字枚举→可读字符串
 */
export function transformOrder(raw: BackendOrderInfo): OrderInfo {
  return {
    orderId: raw.order_id,
    carrier: raw.carrier_info.code,
    trackingNo: raw.tracking_number,
    amount: Number(raw.amount) / 100,
    status: STATUS_MAP[raw.status] ?? 'Unknown',
    createdAt: raw.created_at,
  }
}

/**
 * ⑤ 表单类型（前端提交用）
 */
export interface OrderForm {
  orderId: string
  amount: number       // 前端用元
}

/**
 * ⑥ 后端接收的表单格式
 */
export interface BackendOrderForm {
  order_id: string
  amount: string       // 后端要分为单位的字符串
}

/**
 * ⑦ 反向 transform — 前端表单 → 后端格式
 */
export function toBackendParams(form: OrderForm): BackendOrderForm {
  return {
    order_id: form.orderId,
    amount: String(form.amount * 100),
  }
}
