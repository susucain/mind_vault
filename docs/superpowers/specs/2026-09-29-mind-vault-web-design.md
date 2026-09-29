# Mind Vault Web Design

> Design status: approved through collaborative review
> Date: 2026-09-29

## 1. Goal

在当前 Mind Vault 项目中新增 `mind_vault_web` 前端项目，提供可在 PC 和移动端访问的正式 Web 客户端。首版覆盖完整 P0 能力，以及账户设置、隐私和数据导出。

网页端需要复用现有 NestJS API 和业务模型，并将以下两条核心闭环做完整：

1. 上传资料、建立索引、带引用问答、定位原文。
2. 选择面试资料集、模拟面试、追问、结束复盘、错题复习。

## 2. Confirmed Decisions

### Product shape

- PC 端采用侧栏工作台。
- 移动端采用首页、知识库、面试、我的四个底部 Tab。
- 问答不单独占用底部 Tab，通过首页输入框、全局快捷入口和会话历史进入。
- 首版范围为完整 P0：文件、资料集、文件夹、标签、归档、删除、问答、引用、原文预览、会话历史、面试、错题和复习。
- 同时提供账户、模型偏好、隐私和数据导出页面。

### Technical route

```text
React 19
Vite
TypeScript
React Router
TanStack Query
Zustand
Tailwind CSS
Radix UI
Lucide React
Vitest + Testing Library
Playwright
```

### Visual direction

采用“克制的知识工作台 + AI 对话入口”的混合风格：

- 深色侧栏、浅灰中性内容背景、白色内容面板。
- 蓝色用于链接、引用和主要行动。
- 绿色用于完成/可问答状态。
- 橙色用于待处理、提醒和待复习。
- 首页快捷问答和问答页使用更明显的输入焦点和对话气质。
- 文档管理和任务状态保持密度优先，避免营销式大卡片和过度装饰。

## 3. Information Architecture

### PC navigation

```text
概览
知识库
  ├─ 全部文件
  ├─ 资料集
  ├─ 文件夹
  ├─ 标签
  └─ 回收站 / 归档
问答
  ├─ 新建问答
  └─ 会话历史
面试训练
  ├─ 训练首页
  ├─ 新建训练
  ├─ 训练记录
  └─ 错题与复习
个人设置
  ├─ 账户与登录
  ├─ 数据与导出
  ├─ 模型与偏好
  └─ 隐私
```

### Mobile navigation

```text
首页 | 知识库 | 面试 | 我的
```

### Routes

```text
/login

/app
/app/overview

/app/library
/app/library/documents
/app/library/documents/:documentId
/app/library/documents/:documentId/preview
/app/library/datasets
/app/library/datasets/:datasetId
/app/library/folders
/app/library/tags
/app/library/archive

/app/chat
/app/chat/new
/app/chat/:conversationId

/app/interview
/app/interview/new
/app/interview/sessions
/app/interview/sessions/:sessionId
/app/interview/sessions/:sessionId/feedback
/app/interview/review-items

/app/settings
/app/settings/account
/app/settings/data
/app/settings/preferences
/app/settings/privacy
```

## 4. Responsive Layout

```text
>= 1200px: 完整 PC 工作台，侧栏 240px，可展开双栏内容
768px - 1199px: 窄侧栏或图标侧栏，内容区域单栏优先
< 768px: 底部 Tab，页面单栏，抽屉替代侧栏，底部固定输入区
```

主要响应式规则：

- 问答页 PC 端为会话列表、消息流、引用详情三栏；移动端将会话列表和引用详情改为抽屉。
- 文档页 PC 端为列表 + 详情双栏；移动端使用列表进入详情。
- 面试页 PC 端同时展示题目、资料引用和实时状态；移动端优先题目区，引用和反馈折叠。
- 上传队列在 PC 和移动端共用，移动端使用系统文件选择能力，不依赖微信小程序文件 API。

## 5. Frontend Architecture

```text
mind_vault_web/
  src/
    app/
    routes/
    layouts/
    pages/
    features/
    components/
    api/
    stores/
    hooks/
    lib/
    styles/
    types/
```

职责边界：

- `api/`：HTTP、SSE、上传和错误标准化。
- `features/`：按业务能力组织查询、mutation、表单和局部组件。
- `pages/`：路由级组装，不承载复杂业务逻辑。
- `layouts/`：鉴权布局、PC 侧栏、移动端底部导航和页面容器。
- `components/`：跨业务的表格、状态、引用、预览、空状态和错误状态。
- `stores/`：只保存跨页面 UI 状态和短期会话状态。
- `types/`：前端 API 契约，不直接引用 NestJS 源码。

TanStack Query 管理服务端数据和缓存，Zustand 管理登录用户、当前资料范围、主题、上传队列和问答输入等跨页面 UI 状态。

## 6. Core Data Flows

### Chat

```text
提交问题
  -> POST /conversations/:id/messages/stream
  -> useSSE 解析事件
  -> 增量更新 assistant message
  -> 收到 citations 事件
  -> CitationCard 渲染来源
  -> DocumentPreview 按定位参数打开原文
```

前端内部统一 SSE 事件：

```ts
type ChatStreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'citation'; citation: Citation }
  | { type: 'status'; status: 'searching' | 'reranking' | 'answering' }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: string; message: string };
```

后端事件格式差异只在 `api/conversations.ts` 适配，页面不直接解析后端事件。

### File upload and ingestion

```text
选择文件
  -> 前端格式/大小校验
  -> 创建 upload item
  -> POST /documents/upload
  -> 显示上传进度
  -> 轮询 /documents/:id/status
  -> READY 刷新列表和资料集统计
  -> FAILED 显示失败阶段、原因和重试
```

上传队列要求：

- 同时上传上限为 3。
- 支持单文件取消。
- 页面切换后保留队列状态。
- 成功后刷新列表和统计。
- 失败后可重新触发任务。
- 同名文件有明确的覆盖/保留策略。

### Interview

```text
创建训练配置
  -> POST /interview/sessions
  -> SSE 获取第一道题
  -> 提交回答
  -> SSE 获取追问或下一题
  -> POST /interview/sessions/:id/finish
  -> 获取反馈和 review items
  -> 收藏错题或加入复习
```

## 7. API Contract Gaps

当前后端已有文档、资料集、会话、检索、面试和记忆相关接口，网页端优先复用这些接口。完整 P0 还需要确认或补齐：

```text
GET/POST/PATCH/DELETE /folders
GET/POST/PATCH          /tags
POST                    /data/export
GET                     /data/export/:id/status
```

前端先定义稳定的接口类型和 mock adapter，后端补齐后切换真实 adapter。页面不绑定临时响应结构。

## 8. Error and State Handling

统一错误结构：

```ts
type ApiError = {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
};
```

所有异步功能必须区分 loading、empty、error、success。

- 网络错误：保留输入并支持重试。
- 登录过期：保存路径，登录后返回原页面。
- SSE 中断：保留已有回答并允许继续生成。
- 解析失败：显示具体失败阶段和错误原因。
- 无证据：明确提示资料不足，不展示伪成功。
- 删除：二次确认并刷新列表和统计。
- 导出：排队、生成中、完成、失败状态完整呈现。

## 9. Testing Strategy

### Unit

- API 响应适配和错误标准化。
- SSE 事件解析。
- 上传队列并发、取消和重试。
- 文件格式/大小校验。
- 引用定位参数转换。
- 面试表单校验。

### Component

- 文件状态 Badge。
- 引用卡片展开/收起。
- 消息增量渲染。
- 上传队列。
- 空状态、错误状态。
- PC 侧栏折叠和移动端底部导航。
- 训练反馈和错题收藏。

### E2E

Playwright 验证 1280px、768px 和 390px：

```text
登录 -> 概览 -> 上传 -> 等待索引 -> 问答 -> 查看引用 -> 原文定位
登录 -> 创建面试 -> 回答 -> 结束训练 -> 查看反馈 -> 收藏错题
```

同时验证登录过期、刷新后状态恢复、SSE 中断和上传失败重试。

## 10. Delivery Phases

### Phase 0: Engineering baseline

- 初始化 Vite React TypeScript。
- 配置路由、样式、lint、format、Vitest、Playwright。
- 建立 API client、鉴权状态和 App Shell。
- 实现 PC 侧栏和移动端底部导航。

### Phase 1: Knowledge base

- 概览、文件列表、搜索和筛选。
- 上传队列、解析状态和重试。
- 文件详情、资料集、文件夹、标签、归档和删除。

### Phase 2: Chat

- 会话创建和历史。
- SSE 流式回答和 Markdown。
- 引用卡片、原文预览、定位。
- 复制、收藏、反馈和继续追问。

### Phase 3: Interview

- 训练配置、模拟面试、追问。
- 结束训练和反馈报告。
- 错题收藏和复习。

### Phase 4: Settings and export

- 账户、模型偏好、隐私。
- 数据导出任务。
- 删除数据。
- 统一空、错、权限和加载状态。

### Phase 5: Verification and release

- 单元、组件和 E2E 测试。
- PC / 移动端视觉检查。
- 构建产物和部署说明。
- 将 API 缺口回填为后端任务。

## 11. Acceptance Criteria

- `mind_vault_web` 可独立安装、开发、构建和部署。
- PC 端拥有侧栏工作台，移动端拥有底部 Tab，页面不发生横向溢出。
- 文件上传、解析状态、失败重试可完整操作。
- 问答支持流式文本、引用和原文定位。
- 面试支持创建、回答、追问、结束和反馈。
- 错题可收藏并进入复习。
- 账户、偏好、隐私和导出入口可用；后端暂缺时有明确的空状态或任务状态。
- 关键流程在 1280px、768px、390px 下通过 Playwright。
