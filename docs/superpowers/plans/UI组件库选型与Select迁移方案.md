# UI 组件库选型与 Select 迁移方案

> 目标：为 `mind_vault_web` 选定 UI 组件库，并以 Select 为首批替换对象，把原生控件迁移到组件库，保持「暖纸书房」视觉语言一致、体验不降级、对现有功能零破坏。

---

## 一、现状分析：设计系统盘点

### 1.1 架构事实（先纠正一个此前的误判）

| 事实 | 证据 | 含义 |
|---|---|---|
| **Tailwind v4 已安装** | `src/styles/index.css:1` `@import "tailwindcss"`；`vite.config.ts:2,10` `@tailwindcss/vite` | 采纳 Tailwind 系方案**零新增基础设施** |
| **但零工具类使用** | 全仓 `className` 均为 BEM 语义类（`stats-grid`/`overview-grid`/`dataset-grid`…） | Tailwind 目前**只当 preflight reset 用**（这正是 `index.css` 里没有 CSS reset 的原因） |
| **无 `tailwind.config.*`、无 `components.json`** | Glob 无匹配 | shadcn 从未初始化过 |
| `clsx` 在用，`tailwind-merge` **装了但未使用** | 全仓无 `twMerge` / `cn(` | shadcn 的 `cn()` 工具可直接启用，无冲突 |
| **无路径别名** | `vite.config.ts` 无 `resolve.alias`；import 均为 `'../../components/ui'` 相对路径 | shadcn 默认 `@/` 别名需另行配置 |
| `src/components/ui.tsx` 是**文件** | 非目录 | 与 shadcn 约定的 `src/components/ui/` **目录**同名易混淆，需用 `--path` 或 alias 避开 |

### 1.2 色彩体系（「暖纸书房」）

中性色（墨 / 纸）：
```
--mv-ink          #1f2925   主文字
--mv-ink-soft     #3a453f   次级文字
--mv-canvas       #f5f1e8   页面底色（暖米）
--mv-surface      #fffefb   卡片/面板（近白）
--mv-nav          #ebe6da   侧栏底色
--mv-nav-active   #ded7c6   侧栏悬停
--mv-line         #e2dccf   常规描边
--mv-line-strong  #c9c2b3   输入框描边
--mv-muted        #7d796c   弱文字
--mv-muted-strong #5f5c52   中弱文字
```

强调色：
```
--mv-primary      #2d6b5c   深松绿（主色）
--mv-primary-hover #255a4d
--mv-primary-soft #e6efeb   主色浅底
--mv-accent       #c47a2b   赭石橙（次强调）
--mv-accent-soft  #f6ecd6
```

语义别名（指向上面）：`--mv-blue = --mv-primary`、`--mv-orange = --mv-accent`、`--mv-green #3a8a63`。

**Token 覆盖缺口（迁移前应补齐）**——以下硬编码色绕过了 token 体系，会导致组件库无法统一取色：

| 位置 | 硬编码值 |
|---|---|
| `.status-badge--success` | `#176e46` / `#d9f1e4` |
| `.status-badge--warning` | `#914616` / `#fae3d2` |
| `.status-badge--danger` | `#a13030` / `#f7dddd` |
| `.document-table-head` | `#f6f8fa` |
| `.segmented-control button[aria-pressed]`、`.icon-button.is-selected` | `#eaf1fb` |
| `.capability-notice` / `.review-reason` | `#fff8f2` / `#7b421f` |
| `.markdown-viewer` | `#324155` / `#1c2a3a` / `#edf3fa` |
| `.preview-content p` | `#38475a` |

> 建议先补 `--mv-success/--mv-success-soft/--mv-warning/…` 一组语义 token，再动组件库。否则 shadcn 组件只能取到主色系，状态色仍要写死。

### 1.3 字体

```
--font-serif: Georgia, "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif
sans (body):  Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
              "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
```

- **衬线体承载「书房感」**：用于 `h1`、`.onboarding-card h2`、`.auth-headline`、`.auth-title`、`.auth-step-index`、`.review-q-mark`
- 字号：`h1 1.625rem/600`、`h2 1rem`、正文 `0.875–0.9rem`、小字 `0.75–0.8rem`、微字 `0.68–0.72rem`
- 字重：大量使用 **`650`**（`.header-title`、`.status-badge`、`.document-table-head`、`.dataset-copy`…）。650 不在标准字重轴上，浏览器会就近取整——迁移到组件库时需映射到 `font-semibold(600)` 或 `font-bold(700)`，**这是个视觉回归风险点**
- 字距：`.eyebrow` 用 `0.06em`、`.auth-eyebrow` 用 `0.18em`，配合 `text-transform: uppercase`

### 1.4 间距 / 圆角 / 尺寸

- 间距**无 4px 栅格纪律**：`gap` 取值遍布 4/5/6/7/8/9/10/11/12/13/14/15/16/18/20/22/24/26/28/34/36/38/40/48
- 圆角：`4`(dropdown-item/tooltip) / `5` / `6`(button/select) / `7`(input/panel) / `8`(dialog/workspace-panel) / `11`(auth-brand-badge) / `12` / `16` / `999`(pill)
- 关键高度：`.button 36px`、`.input 40px`、`select 36px`、`.app-header 54px`、`.desktop-sidebar 220px`
- 焦点环统一：`box-shadow: 0 0 0 3px rgb(45 107 92 / 14%)`

> shadcn 默认 `h-9 = 36px`、`rounded-md = 6px`，与 `.button`/`select` **恰好对齐**；但 `.input` 的 40px 对应 `h-10`，需单独指定。这是低成本对齐的有利条件。

### 1.5 组件层现状

已用 Radix 作为**无样式行为层**（仅 3 个 primitive）：
- `@radix-ui/react-dialog` → `Dialog`、`Drawer`（`ui.tsx:51-115`）
- `@radix-ui/react-tooltip` → `Tooltip`（`ui.tsx:117-131`）
- `@radix-ui/react-dropdown-menu` → 配合 `.dropdown-content`/`.dropdown-item` 样式（`index.css:433-436`）

图标：`lucide-react@1.48.0`，26 个文件按名导入（可 tree-shake）。

### 1.6 原生控件清单（迁移对象）

| # | 控件 | 位置 | 复杂度 | 说明 |
|---|---|---|---|---|
| 1 | `<select>` 上传到资料集 | [UploadPanel.tsx:61-63](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/features/documents/UploadPanel.tsx#L61-L63) | 低 | 同行有「新建」按钮，右侧需留位 |
| 2 | `<select>` 训练模式 | [NewInterviewPage.tsx:38](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/pages/interview/NewInterviewPage.tsx#L38) | 低 | 仅 2 个静态选项（快速/深度） |
| 3 | `<select>` 资料集 | [NewInterviewPage.tsx:38](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/pages/interview/NewInterviewPage.tsx#L38) | **高** | 拉取 `pageSize: 100`，需带 placeholder「请选择资料集」；**选项多，原生下拉已不可用** |
| 4 | `<input type="radio">` 面试方向 | NewInterviewPage `.choice-grid` / `.choice-card` | 中 | 4 张卡片式单选，已有 `is-selected` 态 |
| 5 | `<input type="radio">` 检索范围 | `.scope-picker`（chat） | 低 | 标签+单选框列表 |
| 6 | `<input type="number">` 题目数量 | NewInterviewPage | 低 | 1–20 |
| 7 | `<input type="file">`（hidden） | UploadPanel.tsx:77-85 | 低 | 无 UI，仅触发 |
| 8 | `<progress>` | 多处（上传队列、会话进度、评分） | 中 | `accent-color` 定制 |
| 9 | `.segmented-control` | LibraryPage.tsx:207+ | 低 | 已是自定义 button 组，非原生 |

### 1.7 原生 select 的真实体验缺口

这些是「为什么要换」的实质理由，不是为换而换：

1. **无法用 CSS 定制弹层**——原生 option 列表由浏览器/OS 渲染，`--mv-*` 完全失效。设计稿的暖纸质感在展开瞬间断裂。
2. **#3 的选项规模问题**：最多 100 个资料集，原生 select 会退化成一个超长无搜索的滚动列表。
3. **无法表达信息层次**：选项文案带 `· N 份资料`，但无法对数字做弱化/右对齐。
4. **无键盘筛选/分组能力**，无 typeahead 之外的可访问性增强。
5. `#1` 无 placeholder 语义（当前靠 `datasets[0]?.id` 兜底，用户不知道默认选中了什么）。

---

## 二、选型结论

### 2.1 推荐：shadcn/ui

| 评估维度 | 结论 |
|---|---|
| 与现有设计语言适配 | **最佳**。主题即 CSS 变量，可直接把 `--mv-*` 接成唯一真源；组件源码进仓，可逐行改 |
| 与现有技术栈重叠 | **无重复**。现有行为层已是 Radix，而 shadcn 就是「Radix + 样式」，不引入第二套 primitive |
| 基础设施成本 | **零**。Tailwind v4 与 `tailwind-merge` 均已安装 |
| 组件丰富度 | 覆盖 Select / Combobox / Command / Dialog / Table / Popover / Tabs / Progress 等，满足「rich set」 |
| 文档与社区 | 官方文档完整（含 Vite + Tailwind v4 专章），社区规模在同类中最大 |
| 官方支持状态 | 已「全部组件适配 Tailwind v4 与 React 19」，移除 `forwardRef`、改用 `data-slot`，与本项目 React 19.2 匹配 |

### 2.2 唯一真实成本：样式方言分裂

现有页面是 `BEM + --mv-*`，shadcn 组件内部是 Tailwind 工具类。**缓解措施**：把分裂限制在 `src/components/shadcn/` 一个目录内，页面级 `index.css` 零改动。这是增量迁移的常规形态，可接受。

### 2.3 备选方案（若不愿引入工具类方言）

**`@radix-ui/react-select` + 手写 `--mv-*` CSS**：约 60 行 CSS，零新依赖，风格 100% 沿用现有方言。适合「只解决这 3 个 select」。代价是拿不到「丰富组件集」，后续每加一个组件都要自己写。

> 决策分岔：**只要 Select** → 选备选；**要长期组件集** → 选 shadcn。

### 2.4 不推荐

- **Mantine / Chakra UI**：自带完整设计语言 + 运行时样式引擎，会与 `--mv-*` 争夺 token 主权，且 Radix 已在位造成双 primitive 维护
- **Ant Design**：组件最全，但默认设计语言（蓝、4px 栅格、自有 token）与「暖纸书房」冲突面最大，适配等于持续对抗；体积也偏重
- **Base UI / Ark UI**：方向正确但生态与文档成熟度不及 shadcn

---

## 三、实施计划

> **实施记录（2026-10-04）**：阶段 0–5 已执行完毕。下列各节已回写为**实际做法**，与原计划不一致处就地标注原因。总体状态：`pnpm typecheck / lint / test / build` 全绿（43 文件 / 132 用例，基线为 42 / 126）。
>
> 三处主要偏差：① 阶段 1 未跑交互式 `init`，改为手工受控接入；② 阶段 3 的 CLI 产出不可用，改为手工落地组件；③ 「Radix Select 不允许空字符串 value」这一前提在当前版本已不成立，哨兵值方案作废。

### 阶段 0 · 前置整理（不改视觉）✅ 已完成

1. **补齐语义 token**：`:root` 实际新增 15 个（比计划多 5 个，因为正文/代码渲染色与提示面板色同样绕过了 token 体系）：
   ```css
   --mv-success: #176e46;  --mv-success-soft: #d9f1e4;
   --mv-warning: #914616;  --mv-warning-soft: #fae3d2;
   --mv-danger:  #a13030;  --mv-danger-soft:  #f7dddd;
   --mv-sunken:  #f6f8fa;    /* 表头等凹陷面 */
   --mv-selected:#eaf1fb;    /* 选中态浅底 */
   --mv-notice-soft: #fff8f2;  --mv-notice-ink: #7b421f;  /* 提示面板 */
   --mv-prose: #38475a;  --mv-prose-strong: #324155;      /* 正文渲染 */
   --mv-code-bg: #1c2a3a;  --mv-code-fg: #edf3fa;  --mv-code-inline-bg: #eef2f6;
   ```
   并把 1.2 节表格中的硬编码值替换为变量引用，共 15 处：`.status-badge--success/warning/danger`、`.document-status--success/danger`、`.form-error`、`.segmented-control button[aria-pressed]`、`.document-table-head`、`.dropdown-item--danger`、`.dataset-icon`(仅 color)、`.capability-notice`、`.preview-content p/pre`、`.icon-button.is-selected`、`.markdown-viewer` 与其 `pre`/`code`、`.review-reason`。
   **未纳入**（不在 1.2 节清单内，保持原样）：`#ece7db`、`#9a671c`、`#e9b9b9`、`#8a6420`、`#9b3b3b`、`#e3f2e9`、`#f7faff`、`#8e3d3d`/`#fff5f5`、auth 渐变一组、`AuthIllustration.tsx` 内联色。
2. **字重策略：本次未执行**。阶段 0 保持零视觉变化；新建的 shadcn 组件自身不带 `650`，因此「`650 → 600`」的逐处核对留到后续替换 `ui.tsx` 的 `Button`/`Input` 时再统一处理，避免在 Select 迁移里混入无关视觉改动。
3. 基线记录：`typecheck / lint / test` 全绿后再动手，阶段 0 结束时复验仍为 42 文件 / 126 用例。

### 阶段 1 · 安装与配置 ✅ 已完成（改为手工受控接入）

**未执行 `pnpm dlx shadcn@latest init`。** 原因：`init` 会向 `index.css` 注入 `@import "shadcn/tailwind.css"` 与一整套 oklch token，与「`--mv-*` 为唯一真源」直接冲突，事后清理的成本高于手工接入。改为手工完成同样的配置：

| 项 | 实际做法 |
|---|---|
| 路径别名 | [vite.config.ts](file:///Users/susucain/开发/mind-vault/mind_vault_web/vite.config.ts) 加 `resolve.alias`（`@` → `fileURLToPath(new URL('./src', import.meta.url))`，因 `"type": "module"` 无 `__dirname`）；[tsconfig.app.json](file:///Users/susucain/开发/mind-vault/mind_vault_web/tsconfig.app.json) 加 `paths`。注意 `paths` 必须写在 `tsconfig.app.json`，根 `tsconfig.json` 只有 `references` |
| `ui.tsx` 同名冲突 | 手写 `components.json`，`aliases.ui` = `@/components/shadcn/ui`，`aliases.utils` = `@/lib/utils`，`iconLibrary: lucide`；现有 `ui.tsx` 零改动 |
| 工具函数 | 新建 `src/lib/utils.ts` 的 `cn()`（`clsx` + `twMerge`）。`tailwind-merge` 此前已装但全仓无调用，至此才真正启用 |
| 动画依赖 | `tw-animate-css` 装为 devDependency，`index.css` 顶部 `@import "tw-animate-css"` |
| 深色模式 | 加 `@custom-variant dark (&:is(.dark *))`。项目只有浅色主题，把 `dark:` 绑定到永不出现的 `.dark` 类，使 shadcn 组件里的 `dark:` 样式不会因系统深色偏好而意外生效（若用 Tailwind v4 默认的媒体查询式 dark，会出现半深色的割裂态） |

> 包管理注意：本机 `registry.npmjs.org` 的 TLS 证书被拦截（`ERR_TLS_CERT_ALTNAME_INVALID`），安装时需临时用 `--registry=https://registry.npmmirror.com` 或 `npm_config_registry` 环境变量。该镜像地址不会写入 `pnpm-lock.yaml`。

### 阶段 2 · 主题映射（关键步骤）✅ 已完成

在 `src/styles/index.css` 的 `:root` 里补齐 shadcn 语义 token，**全部指向 `--mv-*`**（实际写入 18 个，另加 `--card`/`--popover`/`--secondary`/`--accent` 一组，因为 Select 弹层要用 `bg-popover`、选项高亮要用 `bg-accent`）：

```css
:root {
  --background: var(--mv-canvas);      --foreground: var(--mv-ink);
  --card: var(--mv-surface);           --card-foreground: var(--mv-ink);
  --popover: var(--mv-surface);        --popover-foreground: var(--mv-ink);
  --primary: var(--mv-primary);        --primary-foreground: #fff;
  --secondary: var(--mv-nav);          --secondary-foreground: var(--mv-ink);
  --muted: var(--mv-nav);              --muted-foreground: var(--mv-muted);
  --accent: var(--mv-primary-soft);    --accent-foreground: var(--mv-primary);
  --destructive: var(--mv-danger);
  --border: var(--mv-line);            --input: var(--mv-line-strong);
  --ring: var(--mv-primary);
}
```

再用 `@theme inline` 暴露成 Tailwind 工具类。`inline` 是关键：工具类直接输出 `var(--primary)` 这类**引用**而非快照值，换肤时才能同步生效。

```css
@theme inline {
  /* --mv-* 直通，便于在 shadcn 组件里直接写 bg-surface / text-ink / border-line */
  --color-canvas: var(--mv-canvas);    --color-surface: var(--mv-surface);
  --color-ink: var(--mv-ink);          --color-ink-soft: var(--mv-ink-soft);
  --color-nav: var(--mv-nav);          --color-line: var(--mv-line);
  --color-line-strong: var(--mv-line-strong);
  --color-success: var(--mv-success);  --color-warning: var(--mv-warning);
  --color-danger: var(--mv-danger);    --color-selected: var(--mv-selected);

  /* shadcn 组件取用的语义色（与上面的 :root 一一对应） */
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);        --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);        --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);    --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);            --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);          --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);          --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-sm: 4px;  --radius-md: 6px;  --radius-lg: 8px;  --radius-xl: 12px;
}
```

与计划的**三点**出入：
- **未写 `--font-serif: var(--font-serif)`**：`--font-serif` 既是项目 `:root` 里的字体栈、又是 Tailwind 的 `--font-*` 命名空间，在 `@theme inline` 里自我引用会断链。项目现有 CSS 一直用 `font-family: var(--font-serif)` 直接取值，不需要 `font-serif` 工具类。
- **未暴露 `--color-primary-hover` / `--color-primary-soft` / `--color-muted-strong`**：shadcn 的 Select/Popover/Command 都不取用它们，先不加，避免造出无引用的 token。后续真需要时再补。
- **`--radius` 没有单独定义**：直接把 `--radius-sm/md/lg/xl` 写成字面量 4/6/8/12，与现有设计语言一致。shadcn 默认模板用的是 `calc(var(--radius) - Npx)` 派生式，会得到 2/4/6/10，反而偏离现状。

> 验证方式（比「换肤实验」更省事且可回归）：Tailwind 只生成被实际用到的工具类，因此临时建一个探针文件列出目标类名 → `pnpm build` → 在产物 CSS 里核对取值 → 删除探针。实测结果：
> - `.bg-primary → background-color: var(--primary)`，且 `:root` 有 `--primary: var(--mv-primary)` ⇒ 换肤会同步（与原手写组件读同一变量）
> - `.bg-surface → var(--mv-surface)`、`.border-input → var(--input)`、`.text-muted-foreground → var(--muted-foreground)`、`.ring-ring → var(--ring)`
> - `.rounded-md → 6px`、`.h-9 → calc(var(--spacing) * 9)` 且 `--spacing: .25rem` ⇒ 36px
> - `.animate-in` / `.fade-in-0` / `.zoom-in-95` / `.slide-in-from-top-2` 均已生成 ⇒ `tw-animate-css` 接入成功

### 阶段 3 · 实现 Select 组件 ✅ 已完成（CLI 产出不可用，改为手工落地）

先按计划跑了：

```bash
pnpm dlx shadcn@latest add select command popover --yes
```

**产出不可用，共 4 个问题：**

| # | 问题 | 原因 | 处理 |
|---|---|---|---|
| 1 | 文件被写到项目根的字面量 `./@/components/shadcn/ui/` 目录 | CLI 只读根 `tsconfig.json`，而本项目别名配置在 `tsconfig.app.json` 里，根文件只有 `references` → CLI 找不到 `@/` 映射 | 删除 `./@`，文件按需重写到 `src/components/shadcn/ui/` |
| 2 | 生成 `import { cn } from "cn"`，并把 npm 上的 `cn@0.4.0` 当作依赖装上 | 别名未解析，CLI 把 `@/lib/utils` 的导出名 `cn` 误判为包名 | 卸载 `cn`，改从 `@/lib/utils` 导入 |
| 3 | 从**统一包** `radix-ui` 导入 primitive，并装上 `radix-ui@1.6.7` | 新版 shadcn 已切到 `radix-ui` 统一包，与项目既有的 `@radix-ui/react-*` 分风格 | 卸载 `radix-ui`；改手工安装 `@radix-ui/react-select`、`@radix-ui/react-popover`，沿用项目既有分风格（**避免第二套 primitive**） |
| 4 | 附带生成的 `dialog.tsx` 依赖未安装的 `button.tsx`，一生成就是坏的 | `command` 的 `CommandDialog` 需要 Dialog | 丢弃 `dialog.tsx`，手工版 `command.tsx` **去掉 `CommandDialog`**（本项目不需要命令面板弹窗），依赖链随之收敛 |

因此改为**手工落地**三个组件，做法：保留 shadcn 官方的样式类名（便于日后对照上游更新），只改三处——导入改为 `@/lib/utils` 与 `@radix-ui/react-*`、去掉 `"use client"`、对齐项目代码风格（单引号 / 分号）。落地文件：[select.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/components/shadcn/ui/select.tsx)、[popover.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/components/shadcn/ui/popover.tsx)、[command.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/components/shadcn/ui/command.tsx)。

`DatasetSelect` 实现要点（[DatasetSelect.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/components/shadcn/DatasetSelect.tsx)）：

- props：`datasets`、`value`、`onChange`、`placeholder?`、`searchable?`、`id?`，另加 `aria-label` 与 `className`（前者供无 `<label htmlFor>` 的场景，后者供布局覆盖，见阶段 4）
- `searchable` 时走 `Popover + Command` 带输入筛选；否则走纯 Select
- 选项右侧渲染 `· N 份资料`，用 `text-muted-foreground` 弱化（**不是 `text-muted`**——在 shadcn 里 `--muted` 是背景色，`--muted-foreground` 才是弱化文字色，写错会变成近乎不可见）
- 触发器用 `<SelectValue>` 的**显式子节点**只回显资料集名称。Radix 会在 `valueNodeHasChildren === false` 时把选中项的整段文案（含「· N 份资料」）portal 进触发器，给子节点就能拦住
- Combobox 分支的 `CommandItem` 用 `value={dataset.id}` + `keywords={[dataset.name]}`：cmdk 要求 `value` 唯一，而资料集重名是可能的；cmdk 的默认筛选会把 `keywords` 拼进可搜索串，所以按名称筛选照样成立

**原计划的「最易踩的坑」已不成立**：当前 `@radix-ui/react-select@2.3.7` 的 `shouldShowPlaceholder()` 判定为 `value === '' || value === undefined`，且 `SelectBubbleInput` 会为 `value=""` 补一个原生空 option。已用临时测试实测：`value=""` 正常显示 placeholder，`value="a"` 正常回显「资料集 A」。**故哨兵值方案作废**，不需要 `__none__` 之类的转换。

视觉对齐实际结论：

| 项 | 目标值 | 实际 | 结论 |
|---|---|---|---|
| 触发器高度 | 36px | `h-9` = 36px | 无需覆盖 |
| 圆角 | 6px | `rounded-md` = 6px | 无需覆盖 |
| 描边 | `--mv-line-strong` | `--border` → `--input` → `--mv-line-strong` | 靠阶段 2 映射解决 |
| 焦点环 | `0 0 0 3px rgb(45 107 92 / 14%)` | 手工版把上游的 `ring-ring/50` 改为 `ring-ring/15` | 已对齐 |
| 触发器底色 | `--mv-surface` | 上游 `bg-transparent`，由 `DatasetSelect` 覆盖为 `bg-surface` | 已对齐 |
| 弹层圆角 / 阴影 | 6px / 项目阴影 | 沿用 shadcn 的 `rounded-md` + `shadow-md` | **未改**：弹层是新出现的浮层，无「现状」可比对，先采上游默认，待实机核对 |
| 图标 | `lucide ChevronDown` | 上游同款 | 无需覆盖 |

> 顺带：`class-variance-authority` 原计划要装，但实际 `select`/`popover`/`command` 都不使用 cva（只有 `button`/`badge` 这类会用到），已移除以免留下无引用依赖。日后 `add button` 时 CLI 会自动装回。

### 阶段 4 · 逐处替换 ✅ 已完成

按风险从低到高实际执行了三批：

**批次 A**——`UploadPanel.tsx` #1 ✅
- 用 `<DatasetSelect className="flex-1 min-w-0" datasets={datasets} id="upload-dataset" onChange={setDatasetId} value={selectedDatasetId} />` 替换 `<select>`，同行「新建」按钮与 `.upload-dataset-row` 布局保持不变
- **未走 searchable**：上传场景通常只是「选一个已知的资料集」，保持与原生一致的轻量形态；`searchable` 留给批次 C
- **布局做法**：原 CSS 是 `.upload-dataset-row select { flex: 1 }`，命中不了 Radix 生成的 Trigger（它不是 `<select>`），故用 `className="flex-1 min-w-0"` 顶替。**`min-w-0` 必需**，否则 flex 子项的默认 `min-width: auto` 会让长资料集名把「新建」按钮挤出去
- **可访问性保持**：[UploadPanel.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/features/documents/UploadPanel.tsx) 的 `<label htmlFor="upload-dataset">` 继续生效，因为 Trigger 上加了同值 `id`。这正是 [UploadPanel.test.tsx](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/features/documents/UploadPanel.test.tsx) 既有断言 `getByLabelText('上传到资料集')` 无需改动的原因
- **交互语义零变更**：仍保留 `selectedDatasetId = datasetId || datasets[0]?.id || ''` 的「默认选中第一项」行为，未借机改成显式 placeholder（那是体验变更，不在本次范围）

**批次 B**——`NewInterviewPage.tsx` #2（训练模式）✅
- 纯替换，2 个静态选项，无搜索需求
- 受控值与 `interviewConfigSchema` 校验链路未动；`SelectTrigger` 加 `aria-label="训练模式"` 保持可访问名，另加 `className="w-full bg-surface"`（上游 Trigger 默认 `bg-transparent`，在深底容器里会透出底色）

**批次 C**——`NewInterviewPage.tsx` #3（资料集）✅
- 启用 `<DatasetSelect searchable ... />`（Popover + Command 形态），placeholder 走 `DatasetSelect` 的默认值「请选择资料集」
- **原计划标注的「最易踩的坑」不存在**：计划担心「Radix Select 不允许 `Item value=""`，需用哨兵值」。实测（见阶段 3）当前 `@radix-ui/react-select@2.3.7` 的 `shouldShowPlaceholder()` 判 `value === '' || value === undefined`，`value=""` 正常显示 placeholder。**哨兵值方案未采用**，`form.datasetId` 保持 `''` 初值直传
- 校验失败时的 `form-error` 展示未受影响（校验发生在 `submit` 里，与控件形态无关）

> 未做的事：**没有实机浏览器视觉核对**。本机 `.env` 缺失（`VITE_ENABLE_MOCK_API` 未开），跑起来需要完整后端（MySQL / Neo4j / RabbitMQ）。因此触发器宽度、Popover 宽度、选项内「· N 份资料」的右对齐、弹层阴影目前只有静态层面验证（类名 + 变量链路），**留待实机回归**（见验收标准）。

### 阶段 5 · 测试 ✅ 已完成

1. **既有测试全绿**：`pnpm test` 从基线 **42 文件 / 126 用例** → **43 文件 / 132 用例**。`LibraryPage.test.tsx` 的「默认资料集」数据链路未受影响，`UploadPanel.test.tsx` 的 `getByLabelText('上传到资料集')` 原样通过
2. **新增 `DatasetSelect.test.tsx`（5 例）**：
   - 未选择时触发器显示 placeholder
   - 已选择时触发器**只回显名称、不带「· N 份资料」**（回归防护：这条正是 `SelectValue` 显式子节点 + `valueNodeHasChildren` 那个坑的哨兵）
   - 非 searchable：展开 → 选另一项 → `onChange` 收到正确 id
   - searchable：输入关键字 → 按名称筛到目标项并选中
   - searchable：无匹配时呈现空态
3. **`UploadPanel.test.tsx` 增 1 例**：切换资料集后按新选的资料集入队（`enqueue` 与 `onEnqueued` 都收到 `dataset-2`）
4. **jsdom polyfill 已按计划预置**（[setup.ts](file:///Users/susucain/开发/mind-vault/mind_vault_web/src/test/setup.ts)）：`ResizeObserver`（cmdk 需要，否则 `ResizeObserver is not defined`）、`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`（`@radix-ui/react-select` 需要，否则 `target.hasPointerCapture is not a function`）、预防性补 `scrollIntoView`。实测前两个是**必需项**
5. `pnpm typecheck && pnpm lint` 全绿；`pnpm build` 成功

> **未覆盖**：`NewInterviewPage` 没有测试。该页需要 QueryClient + Router + SSE mock 一整套脚手架，为一个纯替换投入不成比例，其正确性靠 `DatasetSelect` 自身的用例 + 类型检查兜底。

### 阶段 6 · 后续批次排期（非本次范围）

按「收益 ÷ 风险」排：
1. #4 面试方向单选卡（`choice-grid`）→ 可换 shadcn RadioGroup，但现卡片样式已可控，收益中等
2. #9 视图切换 → 换 shadcn ToggleGroup，收益中等且能去掉 `.segmented-control` 自定义 CSS
3. #8 `<progress>` → 换 shadcn Progress，统一 `accent-color` 之外的定制能力
4. #6 `#7` 数字/文件输入 → 低优先，原生已够用
5. `ui.tsx` 中的 `Button`/`Input`/`Dialog`/`Tooltip` → **最后做**，且需保留现有 API（`variant` 取值、`Drawer` 的 `data-side`）以免大面积改调用点

### 阶段 7 · 提交拆分（实际执行）

工作区里还有大量本次任务之外的遗留未提交改动，因此每段提交都**只精确 `git add` 本次相关文件**，不使用 `git add -A` / `git add .`。实际拆为 5 段（第 5 段把「组件 + 替换 + 测试」压在一起，因为 3 处替换都依赖 `DatasetSelect`，拆开会留下不可编译的中间态；`setup.ts` 的 polyfill 也只有这些交互测试才需要）：

| # | 提交信息 | 纳入文件 |
|---|---|---|
| 1 | `chore(web): 接入 shadcn 依赖与路径别名` | `package.json`、`pnpm-lock.yaml` |
| 2 | `chore(web): 配置 shadcn 接入（别名 / components.json / cn 工具）` | `vite.config.ts`、`tsconfig.app.json`、`components.json`、`src/lib/utils.ts` |
| 3 | `refactor(web): 补齐语义色 token 并映射为 Tailwind 主题` | `src/styles/index.css`（含阶段 0 token 补齐 + `@theme inline` + `tw-animate-css` 导入 + `dark` 变体） |
| 4 | `feat(web): 落地 shadcn 基础组件 select / popover / command` | `src/components/shadcn/ui/select.tsx`、`popover.tsx`、`command.tsx` |
| 5 | `feat(web): 新增 DatasetSelect 并替换三处原生 select` | `src/components/shadcn/DatasetSelect.tsx`、`DatasetSelect.test.tsx`、`src/features/documents/UploadPanel.tsx`、`UploadPanel.test.tsx`、`src/pages/interview/NewInterviewPage.tsx`、`src/test/setup.ts` |

> 与原计划的差异：原计划把「阶段 0 的 token 补齐」和「阶段 2 的主题映射」拆成两段，但两者都在同一个 `index.css` 里、且后者的 `@theme inline` 直接引用前者的 `--mv-*`，拆开需要分次编辑同一文件制造中间态，实际合并为第 3 段。原计划第 3/4 段（替换上传页 / 替换训练页）实际合并为第 5 段，理由见上。

---

## 四、风险登记（回写实际结果）

| 风险 | 影响 | 缓解 | 实际结果 |
|---|---|---|---|
| 字重 `650 → 600` 造成视觉回归 | 中 | 阶段 0 统一处理，逐页比对 | **本次未执行**，推迟到后续替换 `ui.tsx` 的 Button/Input 时统一处理 |
| Radix Select 不允许空字符串 value，与「请选择资料集」placeholder 冲突 | 中 | 用哨兵值（如 `__none__`） | **风险不成立**：`@radix-ui/react-select@2.3.7` 实测 `value=""` 正常显示 placeholder，哨兵值方案作废 |
| jsdom 缺 `hasPointerCapture`/`ResizeObserver` 导致测试假失败 | 中 | 阶段 5 预置 polyfill | **已发生并已解决**：两个 API 都是必需的，已在 `setup.ts` 补齐 |
| shadcn 注入的默认 token 覆盖项目配色 | 高 | 阶段 2 显式把 `--background/--primary/--border` 指向 `--mv-*` | **已规避**：未跑 `init`，改为手工写 token，无 oklch 注入 |
| 与 `src/components/ui.tsx` 目录名冲突 | 低 | `aliases.ui` 指向 `src/components/shadcn/ui` | **已规避**：`ui.tsx` 零改动 |
| Tailwind 工具类与 BEM 方言并存导致风格漂移 | 中 | 约定：工具类只出现在 `src/components/shadcn/` 内 | **已遵守**：页面级 `index.css` 除 token 外零改动 |

新增（原计划未预见）：

| 风险 | 影响 | 实际结果 |
|---|---|---|
| shadcn CLI 解析不到别名（根 `tsconfig.json` 只有 `references`） | 中 | 已发生：文件被写到字面量 `./@/` 目录、生成 `import { cn } from "cn"` 并误装 `cn@0.4.0`。改为手工落地组件 |
| CLI 引入第二套 primitive（`radix-ui` 统一包） | 中 | 已发生并已规避：卸载 `radix-ui`，手工装 `@radix-ui/react-select`/`react-popover` |
| npm 官方 registry TLS 被拦截 | 中 | 已发生：改用 `registry.npmmirror.com` 安装；确认镜像地址未写入 lockfile |
| `SelectValue` 会把选中项整段文案 portal 进触发器 | 低 | 已发生：用显式子节点 + `valueNodeHasChildren` 规避，并补回归测试 |
| 无实机视觉核对（缺 `.env` / 后端依赖） | 中 | **仍开放**：弹层阴影、宽度、右对齐仅静态验证，待实机回归 |
| 文案口径不一（「N 份资料」vs DatasetsPage 的「N 个文件」） | 低 | **仍开放**：`DatasetsPage.tsx` 现有文案为「{count} 个文件」，与 `DatasetSelect` 的「· N 份资料」不一致，改一个词即可统一 |

---

## 五、验收标准（回写实际状态）

- [x] 3 处原生 `<select>` 全部替换（代码层面）——**实机视觉一致性待回归**（缺 `.env` / 后端依赖）
- [ ] Select 展开时弹层配色符合「暖纸书房」，不出现浏览器原生样式——**静态已对齐**（`bg-popover` → `--mv-surface`、选项高亮 `bg-accent` → `--mv-primary-soft`），实机待回归
- [x] 资料集选择支持关键字搜索，100 项列表可快速定位（`DatasetSelect searchable` → Popover + Command）
- [x] 键盘可完整操作，`aria` 角色正确（Radix Select 默认 `combobox`；Combobox 分支显式设 `role="combobox"`）
- [x] `UploadPanel.test.tsx` 的 `getByLabelText('上传到资料集')` 仍通过
- [x] `pnpm typecheck && pnpm lint && pnpm test` 全绿（43 文件 / 132 用例）
- [x] 现有 `index.css` 中页面级样式零改动（除阶段 0 的 token 补齐）

> 唯一未闭合项：**实机浏览器视觉核对**。需在具备后端（MySQL / Neo4j / RabbitMQ）与 `.env` 的环境下，逐项确认触发器宽度、Popover 宽度与对齐、「· N 份资料」右对齐、弹层阴影，并顺带确认文案口径（「N 份资料」vs「N 个文件」）是否统一。

---

## 附：参考来源

- [shadcn/ui · Tailwind v4（组件已适配 Tailwind v4 与 React 19）](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui · CLI（init/add/apply，`--path`、`aliases`）](https://ui.shadcn.com/docs/cli)
- [shadcn/ui 中文站 · Tailwind v4](https://www.shadcn.com.cn/docs/tailwind-v4)