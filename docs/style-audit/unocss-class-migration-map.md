# UnoCSS 类名迁移映射清单

## 目的

基于当前源码实际使用情况，整理一份从 `Windi/Tailwind` 风格类名迁移到 `UnoCSS` 推荐写法的对照清单。

这份清单只关注源码里的原子类命名问题，不包含业务语义类，也不为旧写法提供大面积兼容层。

## 迁移规则

### 0. 先区分“项目自定义 px 类”与“标准 rem scale 类”

不是所有数字 utility 都应该改成 `-[px]`。

这次迁移确认了一个重要例外：

- 标准 Tailwind / Uno scale 类应保持原写法
- 不应误改成 bracket `px`

典型保留项：

- `mb-3`
- `max-w-80`
- `px-5`
- `py-5`
- `py-3`
- `pr-80`
- `pb-2.5`
- `pl-5`
- `gap-2`
- `gap-4`
- `gap-6`

这些类在 Uno 下本来就会按 `rem` 语义生成，例如：

- `mb-3` -> `margin-bottom: 0.75rem`
- `px-5` -> `padding-left/right: 1.25rem`
- `pr-80` -> `padding-right: 20rem`

结论：

- 只有“项目历史上本来就表达固定像素值”的类才迁移成 `-[px]`
- 标准 scale 类保留原写法，不做 px 化

### 1. spacing 旧写法统一改为 bracket arbitrary value

- `mb-12px` -> `mb-[12px]`
- `pt-2px` -> `pt-[2px]`
- `mt-16px` -> `mt-[16px]`
- `mr-12px` -> `mr-[12px]`
- 其他同类规则：
- `ml-4px` -> `ml-[4px]`
- `mb-20px` -> `mb-[20px]`
- `pt-8px` -> `pt-[8px]`
- `pt-10px` -> `pt-[10px]`

### 2. 字号旧写法统一改为 bracket arbitrary value

- `text-24px` -> `text-[24px]`
- `text-18px` -> `text-[18px]`
- `text-16px` -> `text-[16px]`
- `text-13px` -> `text-[13px]`

### 3. 固定尺寸类统一改为显式像素值

- `w-400` -> `w-[400px]`
- `w-60` -> `w-[60px]`
- `w-100` -> `w-[100px]`
- `h-40` -> `h-[40px]`
- `h-50` -> `h-[50px]`
- `min-w-100` -> `min-w-[100px]`
- 如果原类已经带 `px` 后缀，也建议统一改成 bracket 写法：
- `w-180px` -> `w-[180px]`
- `h-100px` -> `h-[100px]`
- `max-w-400px` -> `max-w-[400px]`

### 4. 动态颜色类本轮走 `uno.config.ts` 兜底

本轮只保留下面两类动态颜色的兼容：

- ``text-[${variables.textColorPrimary}]``
- ``text-[${variables.textColorRegular}]``

处理方式：

- `uno.config.ts` 通过 `blocklist` 屏蔽源码中的模板字符串 token，避免生成无效规则
- `uno.config.ts` 通过 `safelist` 预生成运行时会落地的具体类名
- 本轮不要求立即把这两类源码全部改成 `:style`、`text-[var(--...)]` 或静态语义类

当前映射关系：

- ``text-[${variables.textColorPrimary}]`` -> `text-[#303133]`
- ``text-[${variables.textColorRegular}]`` -> `text-[#606266]`

注意：

- 除上面两类动态颜色外，其他旧类名不做兼容
- 后续统一迁移时，仍建议把动态颜色逐步收敛为 `:style`、`text-[var(--...)]` 或静态语义类

## 扫描统计

扫描范围：

- `src/**/*.vue`
- `src/**/*.js`
- `src/**/*.ts`

命中统计：

- 旧 spacing 类：`332` 次，`57` 个唯一 token
- 旧字号类：`46` 次，`4` 个唯一 token
- 动态变量颜色类：`13` 次，`2` 个唯一 token
- 固定尺寸候选类：`99` 次，`37` 个唯一 token

说明：

- 固定尺寸候选类里已过滤 `w-1/2`、`w-3/5` 这类分数宽度误命中
- `min-w-0` 属于正常 Uno utility，不在迁移目标里

## 重点迁移项

### A. 旧 spacing 类

高频 token：

| 旧写法 | 次数 | 推荐写法 |
| --- | ---: | --- |
| `mb-12px` | 86 | `mb-[12px]` |
| `ml-4px` | 32 | `ml-[4px]` |
| `mt-16px` | 30 | `mt-[16px]` |
| `pt-2px` | 23 | `pt-[2px]` |
| `mr-12px` | 15 | `mr-[12px]` |
| `mr-4px` | 9 | `mr-[4px]` |
| `mb-20px` | 8 | `mb-[20px]` |
| `mr-8px` | 8 | `mr-[8px]` |
| `pt-8px` | 7 | `pt-[8px]` |
| `mb-4px` | 7 | `mb-[4px]` |
| `pt-10px` | 5 | `pt-[10px]` |
| `mt-12px` | 5 | `mt-[12px]` |
| `ml-60px` | 5 | `ml-[60px]` |
| `ml-6px` | 5 | `ml-[6px]` |
| `mt-10px` | 4 | `mt-[10px]` |

代表性位置：

- `mb-12px`
- `src/views/basic/category-management/index.vue`
- `src/views/basic/fund-coefficient-config/children/PaymentTerm/index.vue`
- `mt-16px`
- `src/views/basic/sku-price-increase-approval/price-detail.vue`
- `src/views/basic/sku-price-increase-approval/procurement-record.vue`
- `pt-2px`
- `src/views/new-product/purchase-follow/children/offer-entry/index.vue`
- `src/views/product/product-management/children/accessories-enter/accessories-details.vue`
- `mr-12px`
- `src/views/basic/product-info-review/children/review-detail/index.vue`
- `src/views/basic/supply-sku-management/children/accessory-supplier-edit-detail/index.vue`

### B. 旧字号类

高频 token：

| 旧写法 | 次数 | 推荐写法 |
| --- | ---: | --- |
| `text-24px` | 25 | `text-[24px]` |
| `text-18px` | 17 | `text-[18px]` |
| `text-16px` | 2 | `text-[16px]` |
| `text-13px` | 2 | `text-[13px]` |

代表性位置：

- `text-24px`
- `src/views/basic/product-info-review/children/review-detail/index.vue`
- `src/views/basic/product-standard-config/children/general-file-outer-labels/general-file-add-edit.vue`
- `src/views/basic/product-standard-config/children/outer-carton-labels/outer-detail.vue`
- `text-18px`
- `src/views/basic/product-info-review/children/review-detail/index.vue`
- `text-16px`
- `src/views/product/product-management/components/batchAssociationSku.vue`
- `text-13px`
- `src/views/basic/standard-defective-rate-management/components/BatchImport.vue`
- `src/views/product/product-management/components/AdjustDialog.vue`

### C. 固定尺寸类

这类最容易在 Uno 下产生“类名一样、语义变了”的问题，必须显式迁移。

高频 token：

| 旧写法 | 次数 | 推荐写法 |
| --- | ---: | --- |
| `h-40` | 8 | `h-[40px]` |
| `w-400` | 7 | `w-[400px]` |
| `min-w-100` | 7 | `min-w-[100px]` |
| `w-60` | 7 | `w-[60px]` |
| `h-50` | 5 | `h-[50px]` |
| `w-100` | 4 | `w-[100px]` |
| `w-180px` | 4 | `w-[180px]` |
| `w-130px` | 3 | `w-[130px]` |
| `h-60` | 2 | `h-[60px]` |
| `h-32` | 2 | `h-[32px]` |
| `w-20px` | 2 | `w-[20px]` |
| `h-100px` | 2 | `h-[100px]` |

低频但也应统一的典型项：

- `w-500px` -> `w-[500px]`
- `w-530px` -> `w-[530px]`
- `w-540px` -> `w-[540px]`
- `w-560px` -> `w-[560px]`
- `w-580px` -> `w-[580px]`
- `w-800px` -> `w-[800px]`
- `w-1000` -> `w-[1000px]`
- `h-14px` -> `h-[14px]`
- `h-85px` -> `h-[85px]`
- `max-w-400px` -> `max-w-[400px]`

代表性位置：

- `w-400`
- `src/views/system/dataRole/components/dataAccess.vue`
- `w-60` / `h-50`
- `src/views/new-product/brand-review/components/brand-detail-style.vue`
- `src/views/new-product/brand-review/components/brand-detail-video.vue`
- `src/views/new-product/new-product-management/children/view-product/index.vue`
- `w-100`
- `src/views/basic/product-standard-config/children/outer-carton-labels/outer-detail.vue`
- `src/views/basic/product-standard-config/children/product-labels/label-detail.vue`
- `min-w-100`
- `src/views/basic/supplier-risk-assessment/components/AddOrEdit.vue`
- `src/views/new-product/purchase-follow/children/offer-entry/index.vue`
- `w-180px`
- `src/views/new-product/purchase-follow/components/sample-satisfy-dialog.vue`
- `src/views/supplierMgt/infoMgt/details/editComponents/business-license-information-list.vue`

### D. 动态颜色类

高风险 token：

| 旧写法 | 次数 | 处理建议 |
| --- | ---: | --- |
| ``text-[${variables.textColorPrimary}]`` | 9 | 本轮由 `uno.config.ts` safelist 兜底 |
| ``text-[${variables.textColorRegular}]`` | 4 | 本轮由 `uno.config.ts` safelist 兜底 |

集中位置：

- `src/views/basic/product-label-management/product-standards/product-standards-add-edit.vue`
- `src/views/basic/product-label-management/product-standards/standardsDetail.vue`
- `src/views/basic/product-label-management/product-standards/components/StandardsBox.vue`
- `src/views/basic/product-label-review/components/StandardsInfo/components/StandardsBox.vue`

补充说明：

- `variables.module.scss` 中当前实际值为：
- `textColorPrimary: #303133`
- `textColorRegular: #606266`

### E. 标题类检查

以下标题样式不依赖 Uno utility，本轮配置不会影响：

- [src/assets/styles/orsd.scss](/D:/company%20code/purchase-receipt-sys/src/assets/styles/orsd.scss#L55) 中的 `.h1, .h2, .h3, .h4, .h5, .h6, h1, h2, h3, h4, h5, h6`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L122) 中的 `.text-h1`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L127) 中的 `.text-h2`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L132) 中的 `.text-h3`

结论：

- `.h1 / h1 / .text-h1` 这类写法属于普通选择器或业务样式类
- 当前 Uno 配置调整只处理 utility 生成，不会改变这些标题类的样式来源

## 建议执行顺序

1. 先批量替换旧 spacing 类。
2. 再批量替换旧字号类。
3. 再统一固定尺寸类为 bracket 写法。
4. 最后逐步清理动态颜色类。

## 备注

这份清单是“迁移规范”视角，不是“兼容层”视角。

即使当前 `uno.config.ts` 通过 theme 映射还能兼容部分旧类名，例如 `w-400`，也不建议把这种兼容当作最终写法保留下来。后续统一迁移时，仍应优先改成显式的 Uno 写法。

另外，源码中还存在一个异常写法：

- `src/views/basic/product-label-management/components/ProductStandardsUpload.vue`
- `:class="text-[variables.textColorRegular]"`

这不是模板字符串，也不是稳定可提取的 Uno utility。它不在本轮 safelist 范围内，后续正式迁移时应单独修正。
