# WindiCSS 迁移 UnoCSS 经验记录

## 背景

本次迁移不是“直接把 WindiCSS 替换成 UnoCSS”这么简单，核心工作量主要在源码类名清理，而不在构建接入本身。

这个项目历史上混用了几类写法：

- `Windi/Tailwind` 风格 utility
- 项目自定义的 `px` 命名风格 utility
- 运行时动态拼接 class
- 普通业务语义类
- 局部 `scss` 里手写的同名选择器

UnoCSS 对基础 utility 兼容较好，但不会无条件兼容项目历史扩展写法。因此更可靠的迁移策略是：

1. 先统一源码 class 写法。
2. 再保持 `uno.config.ts` 极简。
3. 最后用 CLI 和构建做双重验证。

## 本次迁移的核心结论

### 1. 不要保留“旧 theme 兼容层”思路

这次最终确认，`uno.config.ts` 最稳的方案不是继续继承旧 `tailwind.config.mjs`，而是尽量收缩配置，只保留必要兜底。

原因：

- 兼容层会掩盖源码里本来就不规范的旧类名。
- 项目一旦切换到 Uno，后续新代码会继续沿用旧命名，债务无法收敛。
- 同名 class 在 Windi 和 Uno 下可能语义不一致，最危险。

本次实践后的原则：

- 删除 `tailwind.config.mjs` 依赖。
- 删除旧 `theme` 映射兼容。
- 删除 `important: true`。
- 只保留极少数必须存在的 `safelist` 和 `blocklist`。

## 必须统一的类名规则

### 2. 历史“裸数字类”要先区分语义，再决定是否改成 `px`

这次迁移里最容易犯的错，是把所有数字类都简单理解成 `px`。

正确做法是先区分两类：

- 项目历史自定义、语义本来就是固定像素值的类
- Tailwind / Uno 原生 spacing scale，语义本来就是 `rem`

只有第一类才应该改成 bracket `px` 写法。

典型规则：

- `text-14` -> `text-[14px]`
- `w-400` -> `w-[400px]`
- `h-40` -> `h-[40px]`
- `mt-10` -> `mt-[10px]`
- `ml-22` -> `ml-[22px]`
- `ml-3` -> `ml-[3px]`
- `mr-3` -> `mr-[3px]`
- `mt-5` -> `mt-[5px]`

结论：

- 只要该项目里的旧类语义本来就是 `px`，迁移时就不要保留旧写法。
- 不要依赖 Uno 默认 spacing/font/size scale 去“碰巧生成”。

但这条规则有一个关键例外：

- 如果类名本来就是标准 Tailwind / Uno scale，例如 `mb-3`、`px-5`、`py-3`、`gap-4`、`pr-80`、`pb-2.5`、`pl-5`、`max-w-80`
- 那么它们本来的语义就是 `rem`
- 这类不应该改成 `mb-[3px]`、`px-[5px]`、`gap-[4px]` 这类写法

本次实际修正过的误改项：

- `mb-[3px]` -> `mb-3`
- `max-w-[80px]` -> `max-w-80`
- `px-[5px]` -> `px-5`
- `py-[5px]` -> `py-5`
- `py-[3px]` -> `py-3`
- `pr-[80px]` -> `pr-80`
- `pb-[2.5px]` -> `pb-2.5`
- `pl-[5px]` -> `pl-5`
- `gap-[2px]` -> `gap-2`
- `gap-[4px]` -> `gap-4`
- `gap-[6px]` -> `gap-6`

### 3. `xx-12px` 这类旧写法也要统一改 bracket

历史 Windi 写法：

- `mb-12px`
- `pt-2px`
- `text-24px`

Uno 推荐写法：

- `mb-[12px]`
- `pt-[2px]`
- `text-[24px]`

原因很直接：

- `mb-12px` 不是 Uno 的标准 utility 形式。
- `mb-[12px]` 是明确、稳定、可预测的写法。

### 4. 小数值也不要保留 scale 语义

这次实际碰到的典型项：

- `pb-2.5`
- `gap-2.5`

如果它表达的是明确像素值，就应改成：

- `pb-[2.5px]`
- `gap-[2.5px]`

注意：

- 迁移脚本/批量替换时容易把它错误改成 `pb-[2px].5` 这类非法写法。
- 小数类必须单独复核，不能盲替换。

## 动态类的经验

### 5. 运行时动态 class 不能指望 Uno 自动提取

这次确认，类似下面这种写法必须重点排查：

```vue
:class="form.status === 0 ? '' : 'mb-0'"
```

虽然运行时可能能拿到 `mb-0`，但 Uno 是静态提取工具，这类不稳定字符串拼接要尽量改成可静态识别的形式。

更稳妥的写法：

```vue
:class="{ 'mb-0': form.status !== 0 }"
```

迁移原则：

- 避免三元返回 utility 字符串。
- 避免模板字符串拼接 utility。
- 优先使用对象写法或明确枚举值。

### 6. 动态颜色类只保留最小兜底，不兼容全部老写法

本次项目里存在：

- ``text-[${variables.textColorPrimary}]``
- ``text-[${variables.textColorRegular}]``

这类写法 Uno 无法稳定静态提取，因此本次只做了“最小安全兜底”：

- `uno.config.ts` 用 `blocklist` 排除 `${...}` token
- `uno.config.ts` 用 `safelist` 保留：
  - `text-[#303133]`
  - `text-[#606266]`

经验结论：

- 只兜底确认存在的少数动态颜色。
- 其他旧动态写法不要继续兼容。
- 后续更推荐改成 `:style`、`text-[var(--...)]` 或静态语义类。

## 样式文件层面的经验

### 7. 不能把 bracket utility 当作 `scss` 选择器名使用

这是本次迁移里真正引发构建失败的一类问题。

错误示例：

```scss
.ml-[8px] {
  margin-left: 8px;
}
```

Sass 无法解析这类选择器，构建会直接报错。

本次实际清理过的情况包括：

- 删除无意义的 `.ml-[8px]`
- 删除无意义的 `.mb-[32px]`
- 把 `.left-[120px]` 这类中间语义类收回为模板上的 `ml-[120px]`

经验结论：

- bracket utility 只能出现在模板 `class` 中。
- 不能把它们直接当成本地 `scss/css` 选择器类名。
- 批量替换后必须额外扫描样式文件，防止 Sass 语法报错。

建议扫描命令：

```bash
rg -n --glob "*.{scss,vue,css}" "\.[A-Za-z0-9_-]+-\[[^\]]+\]" src
```

## 普通业务类与 Uno 的边界

### 8. 业务语义类不要误当成 utility 迁移

例如：

- `.h1`
- `.text-h1`
- `h1`
- `.container`

这类要区分来源：

- 如果是业务样式或全局样式定义，不应机械替换。
- 如果和 Uno 预设保留类冲突，再通过 `blocklist` 或重命名处理。

本次经验是：

- 标题类 `.h1 / h1 / .text-h1` 不受本轮 Uno 迁移影响。
- `container` 存在冲突风险，需要通过 `blocklist` 规避。

## 配置策略经验

### 9. `uno.config.ts` 应该保持“最小安全版”

本次最终收敛后的方向是：

- 使用 `presetWind3({ preflight: false })`
- 只保留少量 `safelist`
- 只保留少量 `blocklist`

而不是继续把旧项目的 token、theme、width、spacing 全部搬进去。

经验结论：

- 配置越厚，越难知道真正还依赖了哪些旧类。
- 配置越薄，源码问题暴露越快，迁移越能收敛。

## 验证方法经验

### 10. 不能只看源码替换，必须做两层验证

本次验证分两层：

#### 第一层：CLI 原子 CSS 生成验证

用于确认 Uno 能否正确提取源码 utility。

命令：

```bash
pnpm.cmd exec unocss "index.html" "src/**/*.{vue,js,ts,jsx,tsx}" -c uno.config.ts -o docs/style-audit/uno-atomic.css -m --split-css false
```

作用：

- 验证 utility 是否被正确提取
- 用于和 `windi-atomic.css` 做原子类层面的对比

#### 第二层：真实构建验证

用于确认 `.vue + scss + vite` 整体链路无问题。

命令：

```bash
pnpm.cmd run build:uno
```

作用：

- 验证 Sass 是否因 bracket 选择器出错
- 验证 Uno 模式下项目整体是否可构建
- 验证最终产物是否正常输出

经验结论：

- 只跑 CLI 不够，因为 CLI 不会暴露 Sass 选择器问题。
- 只跑构建也不够，因为不方便做 utility 差异审计。
- 两层都要跑。

## 推荐迁移流程

后续其他项目建议按这个顺序走：

1. 先从源码扫描出所有旧 utility。
2. 把所有“裸数字类”统一改成 `-[px]`。
3. 把所有 `xx-12px` 风格统一改成 bracket arbitrary value。
4. 把动态 class 改成 Uno 可静态提取的写法。
5. 扫描并删除 `scss/css` 中的 bracket 选择器残留。
6. 把 `uno.config.ts` 收缩成最小安全版。
7. 用 Uno CLI 生成 `uno-atomic.css`。
8. 用 `build:uno` 做最终构建验证。

## 本次迁移最值得记住的几条

- 真正难迁的不是 Uno，而是历史类名。
- 裸数字类必须统一收敛为显式 `px`。
- 动态 class 是 Uno 迁移的高风险点。
- bracket utility 不能出现在 `scss` 选择器里。
- `uno.config.ts` 越薄越安全。
- 必须同时跑 CLI 和真实构建。

## 相关文档

- `docs/style-audit/windi-atomic-summary.md`
- `docs/style-audit/unocss-class-migration-map.md`
- `docs/style-audit/uno-vs-windi-atomic-compare.md`
- `docs/style-audit/uno-atomic.css`
- `docs/style-audit/windi-atomic.css`
