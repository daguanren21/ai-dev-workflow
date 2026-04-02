# UnoCSS 与 WindiCSS 原子类对比

## 对比对象

- Windi 原子样式表：`docs/style-audit/windi-atomic.css`
- Uno 原子样式表：`docs/style-audit/uno-atomic.css`
- Windi 使用统计：`docs/style-audit/windi-class-inventory.json`

## 生成方式

### Windi

- 已有产物来自本地 `windicss@3.5.1` 提取
- 扫描范围：`index.html`、`src/**/*.{vue,js,ts,jsx,tsx}`

### Uno

- 使用本地 CLI 直接生成
- 命令：

```bash
node node_modules/.pnpm/@unocss+cli@66.6.6/node_modules/@unocss/cli/bin/unocss.mjs "index.html" "src/**/*.{vue,js,ts,jsx,tsx}" -c uno.config.ts -o docs/style-audit/uno-atomic.css -m --split-css false
```

## 结果概览

- Windi 原子样式表大小：`24566 bytes`
- Uno 原子样式表大小：`17634 bytes`
- Uno 相比 Windi 减少：`6932 bytes`，约 `-28.22%`
- Windi 已识别 utility token 数：`369`
- Uno CLI 生成 utility 数：`310`

## 结论

Uno 生成出来的原子 CSS 更小，但当前不能直接解读成“更优”，更准确的结论是：

- `UnoCSS` 保留了大量通用 utility
- 但没有完整覆盖当前项目里依赖的 `Windi` 自定义命名风格
- 当前项目从 `Windi/Tailwind` 风格扩展迁移到 `UnoCSS` 不是无感切换，必须先清理一批 class 命名

## 已验证可正常覆盖的类

以下类在 Windi 与 Uno 产物中都能找到：

- `flex`
- `w-full`
- `w-400`
- `text-info`

这说明基础布局类、部分宽度类、部分颜色类在当前 `uno.config.ts` 下是能继承过来的。

但需要特别注意：

- 当前 `w-400` 之所以还能生成成 `400px`，是因为本次对比用的 `uno.config.ts` 显式继承了 `tailwind.config.mjs` 里的 `width` 扩展
- 这不代表后续统一迁移时可以继续依赖 `w-400` 这一类旧命名
- 对于固定像素尺寸，后续更推荐直接改成 `w-[400px]`、`h-[50px]` 这类显式写法，避免再绑定到旧的 theme scale

## 关键不兼容点

### 1. `*-12px / *-2px / *-16px` 这类 spacing 命名不能原样继承

以下类在 `windi-atomic.css` 中存在，但在 `uno-atomic.css` 中不存在：

- `mb-12px`
- `pt-2px`
- `mt-16px`
- `mr-12px`

而 `uno-atomic.css` 中实际存在的是：

- `mb-12`
- `pt-2`
- `mt-16`
- `mr-12`

这说明项目里当前大量使用的 `Windi 自定义 px 后缀命名`，在 Uno 里不会按原类名生成。

迁移含义：

- 如果源码继续写 `mb-12px`，Uno 下这类样式不会被命中
- 需要批量改写成 Uno 可识别的写法
- 推荐迁移写法：
- `mb-12px` -> `mb-[12px]`
- `pt-2px` -> `pt-[2px]`
- `mt-16px` -> `mt-[16px]`
- `mr-12px` -> `mr-[12px]`

### 2. `text-24px / text-18px / text-13px` 这类字号类不能原样继承

以下类在 `windi-atomic.css` 中存在，但在 `uno-atomic.css` 中不存在：

- `text-24px`
- `text-18px`
- `text-13px`

这说明当前项目的字号扩展命名同样带有明显的 `Windi` 风格，不是 Uno 默认可直接承接的写法。

迁移含义：

- 需要统一改写为 Uno 可识别的字号表达方式
- 推荐迁移写法：
- `text-24px` -> `text-[24px]`
- `text-18px` -> `text-[18px]`
- `text-13px` -> `text-[13px]`

### 3. 动态颜色类不能静态提取，但本轮保留配置兜底

项目里存在以下写法：

- ``text-[${variables.textColorPrimary}]``
- ``text-[${variables.textColorRegular}]``

这类 class 依赖运行时模板字符串，Uno 无法稳定静态提取。

当前处理策略：

- `uno.config.ts` 通过 `blocklist` 排除包含 `${...}` 的 token，避免生成无效 CSS
- `uno.config.ts` 通过 `safelist` 预生成两个运行时会落地的类：
- `text-[#303133]`
- `text-[#606266]`

迁移含义：

- 本轮不要求立即改源码
- 只有这两类动态颜色走配置兜底
- 其他旧类名不做兼容
- 后续统一迁移时，仍建议改成 `:style`、`text-[var(--...)]` 或静态语义类

### 4. `container` 与项目语义类冲突

项目中有普通业务类名 `container`，而 Uno preset 自带 `container` shortcut。

当前已在 `uno.config.ts` 中通过 `blocklist` 规避冲突。

迁移含义：

- 后续要么保留 blocklist
- 要么把业务类 `container` 重命名，避免与原子引擎保留类冲突

### 5. 标题类不受当前 Uno 方案影响

已核对以下样式来源：

- [src/assets/styles/orsd.scss](/D:/company%20code/purchase-receipt-sys/src/assets/styles/orsd.scss#L55) 定义了 `.h1, .h2, .h3, .h4, .h5, .h6, h1, h2, h3, h4, h5, h6`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L122) 定义了 `.text-h1`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L127) 定义了 `.text-h2`
- [src/views/inner-preview/index.vue](/D:/company%20code/purchase-receipt-sys/src/views/inner-preview/index.vue#L132) 定义了 `.text-h3`

这些都属于普通样式选择器或业务语义类，不依赖 Uno utility 生成，因此不会因为当前 safelist / blocklist 调整而失效。

## 迁移更改点总结

如果后续正式从 Windi 迁移到 Uno，最核心的改动不在构建，而在类名清理：

1. 批量替换 spacing 类。
2. 批量替换字号类。
3. 固定尺寸类尽量改为显式像素值。
4. 只对两类动态颜色做配置兜底，其余旧写法不兼容。
5. 处理 `container` 语义类冲突。
6. 在完成源码清理前，不建议把 Uno 当作无兼容层的直接替换方案。

## 当前建议

更稳妥的迁移路线是：

1. 先保留现有 `Windi` 产物作为基线。
2. 根据这份对比结果，先做一轮 class 命名标准化。
3. 再次用 Uno CLI 生成原子样式表复核。
4. 等差异收敛后，再切到 `vite` 层的正式 Uno 接入。
