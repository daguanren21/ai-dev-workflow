# WindiCSS 原子样式提取说明

## 目的

基于当前项目的 WindiCSS 配置和源码实际用法，提取一份可直接用于和 UnoCSS 对比的原子样式表。

## 输入来源

- 配置文件：`tailwind.config.mjs`
- 扫描范围：`index.html`、`src/**/*.{vue,js,ts,jsx,tsx}`
- 接入方式：`src/main.ts` 中的 `virtual:windi.css`

## 产物文件

- 原子样式表：`docs/style-audit/windi-atomic.css`
- class 清单：`docs/style-audit/windi-class-inventory.json`

## 提取方式

- 使用本地 `windicss@3.5.1` 的 `Processor` 和 `HTMLParser`
- 采用 Windi 的 interpretation 模式生成 class selector
- 最终对样式表执行 `sort().combine()` 去重
- 本次输出不包含 preflight，只保留原子类样式，便于和 UnoCSS utilities 对比

## 当前统计

- 扫描文件数：`635`
- 原始 class token 去重数：`1347`
- 成功匹配为 Windi utility 的 token 数：`369`
- 未匹配 token 数：`940`
- 去重后原子样式表体积：`24566 bytes`

## 配置扩展摘要

来自 `tailwind.config.mjs -> theme.extend`：

- `textColor`：3 个扩展色值
- `backgroundColor`：1 个扩展色值
- `width`：30 个扩展尺寸
- `minWidth`：19 个扩展尺寸
- `maxWidth`：13 个扩展尺寸
- `minHeight`：8 个扩展尺寸
- `height`：22 个扩展尺寸
- `margin`：22 个扩展尺寸
- `padding`：15 个扩展尺寸
- `borderRadius`：2 个扩展尺寸
- `zIndex`：7 个扩展层级
- `lineHeight`：15 个扩展值
- `fontSize`：12 个扩展值
- `fontWeight`：1 个扩展值

重点自定义 token：

- 颜色：`text-info`、`text-error`、`text-click`、`bg-default`
- 尺寸：大量 `w-*` / `min-w-*` / `h-*` 的 px 级扩展，例如 `w-400`、`min-w-424`、`h-1080`
- 间距：大量 `m-*` / `p-*` 的 px 级扩展，例如 `mb-12px`、`pt-2px`
- 文本：`text-24px`、`leading-1.2h` 等非默认刻度
- 层级：`z-10001` 到 `z-10007`

## 读取结果时的注意事项

- `windi-atomic.css` 适合拿去和 UnoCSS 生成结果做体积、规则数量、命中 class 的对比。
- `windi-class-inventory.json` 里的 `topMatchedUtilityTokens` 是实际识别成功的原子类，优先看这部分。
- `ignoredTokens` 里有大量业务语义 class，例如 `app-container`、`dialog-footer`，这些本来就不是原子类。
- `ignoredTokens` 里也混入了一部分 `:class` 动态表达式碎片，例如 `===`、`?`、`[`、`]`。这是 Windi HTML 解析在 Vue 动态绑定上的天然噪音，不代表样式缺失。
- 如果后续要做更精细的 UnoCSS 迁移评估，建议再补一轮“动态 class 模式”梳理，例如字符串拼接、数组 class、模板字符串中的颜色和状态类。

## 当前最常见的已命中原子类

按命中频次排序，前几项包括：

- `w-full`
- `flex`
- `mb-12px`
- `items-center`
- `font-bold`
- `text-24px`
- `pt-2px`
- `ml-4px`
- `mb-0`
- `text-center`

