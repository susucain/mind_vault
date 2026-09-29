# Mind Vault Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `mind_vault_web` 中实现一套响应式 Mind Vault Web 客户端，覆盖知识库、可引用问答、面试训练、错题复习、账户设置和数据导出。

**Architecture:** 使用 React + Vite + TypeScript 构建 SPA。REST 数据由 TanStack Query 管理，登录和跨页面 UI 状态由 Zustand 管理，问答/面试使用统一 SSE 解析器，PC 使用侧栏工作台、移动端使用底部导航和抽屉布局。前端通过独立 API adapter 对接现有 NestJS API，不直接引用后端源码。

**Tech Stack:** React 19, Vite, TypeScript, React Router, TanStack Query, Zustand, Tailwind CSS, Radix UI, Lucide React, Vitest, Testing Library, Playwright.

---

## 1. Scope and Existing API

当前后端已有以下可复用接口：

```text
POST   /auth/dev-login
GET    /me

GET    /documents
GET    /documents/:id
POST   /documents/upload
GET    /documents/:id/status
POST   /documents/:id/retry
DELETE /documents/:id
POST   /documents/:id/reindex

GET/POST/PATCH/DELETE /datasets

POST/GET/PATCH         /conversations
GET                    /conversations/:id/messages
POST                   /conversations/:id/messages
POST                   /conversations/:id/messages/stream

POST/GET               /interview/sessions
POST                   /interview/sessions/stream
GET                    /interview/sessions/:id
POST                   /interview/sessions/:id/answers/stream
POST                   /interview/sessions/:id/finish
GET                    /interview/review-items
GET                    /interview/review-items/:id
POST                   /interview/review-items/:id/answers
PATCH                  /interview/review-items/:id

GET/POST/PATCH/DELETE  /memories
```

文件夹、标签、归档和导出先定义前端类型与 mock adapter，真实接口可用后只替换 adapter，不修改页面组件。

## 2. File Map

### Task 1 files

```text
mind_vault_web/
  package.json
  pnpm-lock.yaml
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  .env.example
  src/main.tsx
  src/app/App.tsx
  src/app/providers.tsx
  src/app/router.tsx
  src/styles/index.css
  src/lib/query-client.ts
  src/lib/storage.ts
  src/lib/errors.ts
  src/types/api.ts
  src/types/domain.ts
```

### Task 2 files

```text
mind_vault_web/src/
  api/client.ts
  api/auth.ts
  api/documents.ts
  api/datasets.ts
  api/conversations.ts
  api/interview.ts
  api/memories.ts
  api/export.ts
  stores/auth.store.ts
  stores/app.store.ts
  stores/upload.store.ts
  hooks/use-sse.ts
  hooks/use-upload-queue.ts
```

### Task 3 files

```text
mind_vault_web/src/layouts/AuthLayout.tsx
mind_vault_web/src/layouts/AppShell.tsx
mind_vault_web/src/layouts/DesktopSidebar.tsx
mind_vault_web/src/layouts/MobileBottomNav.tsx
mind_vault_web/src/layouts/PageContainer.tsx
mind_vault_web/src/components/ui/*
mind_vault_web/src/components/status-badge/StatusBadge.tsx
mind_vault_web/src/components/empty-state/EmptyState.tsx
mind_vault_web/src/components/error-state/ErrorState.tsx
mind_vault_web/src/components/loading-state/LoadingState.tsx
mind_vault_web/src/components/command-menu/CommandMenu.tsx
```

### Task 4 files

```text
mind_vault_web/src/features/auth/*
mind_vault_web/src/pages/auth/LoginPage.tsx
mind_vault_web/src/pages/overview/OverviewPage.tsx
mind_vault_web/src/pages/library/LibraryPage.tsx
mind_vault_web/src/pages/library/DatasetsPage.tsx
mind_vault_web/src/pages/library/DocumentDetailPage.tsx
mind_vault_web/src/pages/library/DocumentPreviewPage.tsx
mind_vault_web/src/features/overview/*
mind_vault_web/src/features/documents/*
mind_vault_web/src/features/datasets/*
mind_vault_web/src/features/folders/*
mind_vault_web/src/features/tags/*
```

### Task 5 files

```text
mind_vault_web/src/pages/chat/ChatPage.tsx
mind_vault_web/src/pages/chat/NewChatPage.tsx
mind_vault_web/src/features/chat/*
mind_vault_web/src/components/citation-card/CitationCard.tsx
mind_vault_web/src/components/markdown-viewer/MarkdownViewer.tsx
mind_vault_web/src/components/document-preview/DocumentPreview.tsx
```

### Task 6 files

```text
mind_vault_web/src/pages/interview/InterviewPage.tsx
mind_vault_web/src/pages/interview/NewInterviewPage.tsx
mind_vault_web/src/pages/interview/InterviewSessionPage.tsx
mind_vault_web/src/pages/interview/InterviewFeedbackPage.tsx
mind_vault_web/src/pages/interview/ReviewItemsPage.tsx
mind_vault_web/src/features/interview/*
mind_vault_web/src/features/review-items/*
```

### Task 7 files

```text
mind_vault_web/src/pages/settings/SettingsPage.tsx
mind_vault_web/src/features/settings/*
mind_vault_web/src/features/export/*
mind_vault_web/src/pages/not-found/NotFoundPage.tsx
```

### Task 8 test files

```text
mind_vault_web/src/**/*.test.ts
mind_vault_web/src/**/*.test.tsx
mind_vault_web/e2e/auth.spec.ts
mind_vault_web/e2e/library.spec.ts
mind_vault_web/e2e/chat.spec.ts
mind_vault_web/e2e/interview.spec.ts
mind_vault_web/e2e/responsive.spec.ts
mind_vault_web/playwright.config.ts
```

## 3. Task 1: Initialize Frontend Baseline

**Files:**

- Create all files listed under Task 1.
- Create `mind_vault_web/.gitignore`.
- Create `mind_vault_web/README.md`.

- [ ] **Step 1: Scaffold the Vite project**

Run:

```bash
pnpm create vite mind_vault_web --template react-ts
```

Remove the generated demo files and keep the generated `package.json`, `vite.config.ts`, and TypeScript configuration as the baseline.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```bash
cd mind_vault_web
pnpm add @tanstack/react-query @tanstack/react-query-devtools react-router-dom zustand lucide-react clsx tailwind-merge zod react-markdown remark-gfm @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip
pnpm add -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event playwright @playwright/test
```

- [ ] **Step 3: Configure the app entry**

`src/main.tsx` must render `App` inside `StrictMode`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Add environment configuration**

Create `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_ENABLE_MOCK_API=false
```

`src/lib/query-client.ts` must export a `QueryClient` with `staleTime: 30_000`, retry count `1`, and no retry for `401` or `403`.

- [ ] **Step 5: Add shared type contracts**

Define `ApiError`, `PageResult<T>`, `DocumentStatus`, `Citation`, `Conversation`, `ChatMessage`, `InterviewSession`, `ReviewItem`, `Dataset`, and upload types in `src/types/api.ts` and `src/types/domain.ts`. All document locator fields must support `page`, `slide`, `sheet`, `cellRange`, `lineStart`, `lineEnd`, and `jsonPath`.

- [ ] **Step 6: Verify the baseline**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: both commands exit with code `0` and produce `dist/`.

- [ ] **Step 7: Commit**

```bash
git add mind_vault_web
git commit -m "feat(web): initialize react frontend"
```

## 4. Task 2: API, Auth, SSE, and Upload Infrastructure

**Files:**

- Create `src/api/client.ts`, `auth.ts`, `documents.ts`, `datasets.ts`, `conversations.ts`, `interview.ts`, `memories.ts`, and `export.ts`.
- Create `src/stores/auth.store.ts`, `app.store.ts`, and `upload.store.ts`.
- Create `src/hooks/use-sse.ts` and `use-upload-queue.ts`.
- Test: `src/api/client.test.ts`, `src/hooks/use-sse.test.ts`, `src/hooks/use-upload-queue.test.ts`.

- [ ] **Step 1: Write API client tests**

Test that the client:

```ts
it('adds bearer token to authenticated requests', async () => {
  // mock fetch, set auth token, call get('/me'), assert Authorization header
});

it('normalizes non-2xx responses to ApiError', async () => {
  // mock 422 response, assert code, message, status, requestId
});
```

- [ ] **Step 2: Implement API client**

Implement `request<T>(path, init)` with:

- `VITE_API_BASE_URL` prefix.
- JSON serialization except `FormData`.
- `Authorization: Bearer <token>` injection.
- `X-Request-ID` generated per request.
- `ApiError` normalization.
- A single `401` callback that clears auth state and navigates to `/login`.

- [ ] **Step 3: Implement domain API modules**

Each API module must expose typed functions, for example:

```ts
export const listDocuments = (query: DocumentQuery) =>
  request<PageResult<Document>>(`/documents?${new URLSearchParams(query)}`);

export const uploadDocument = (file: File, datasetIds: string[]) => {
  const body = new FormData();
  body.append('file', file);
  body.append('datasetIds', JSON.stringify(datasetIds));
  return request<Document>('/documents/upload', { method: 'POST', body });
};
```

Add mock implementations for folders, tags, archive, and export behind `VITE_ENABLE_MOCK_API`.

- [ ] **Step 4: Write SSE parser tests**

The parser must convert chunks into:

```ts
type StreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'citation'; citation: Citation }
  | { type: 'status'; status: 'searching' | 'reranking' | 'answering' }
  | { type: 'done'; messageId: string }
  | { type: 'error'; code: string; message: string };
```

Test split chunks, multiple events in one chunk, `[DONE]`, malformed JSON, and an aborted request.

- [ ] **Step 5: Implement `useSse`**

Use `fetch`, `ReadableStreamDefaultReader`, `TextDecoder`, and `AbortController`. Expose `{ start, abort, status, error }`. Never discard already received tokens when the connection aborts.

- [ ] **Step 6: Write upload queue tests**

Test:

- Maximum three active uploads.
- A queued file starts when an active file completes.
- Cancel prevents the request from starting.
- Failed status stores `failedStage` and `errorMessage`.
- Retry moves the item back to `queued`.

- [ ] **Step 7: Implement `useUploadQueue`**

Store queue items in Zustand:

```ts
type UploadItem = {
  localId: string;
  file: File;
  documentId?: string;
  status: 'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  failedStage?: string;
  errorMessage?: string;
};
```

Poll `/documents/:id/status` every `2_000ms` while processing and stop polling on `ready`, `failed`, or `cancelled`.

- [ ] **Step 8: Run infrastructure tests and commit**

```bash
pnpm test --run
git add mind_vault_web
git commit -m "feat(web): add api auth stream and upload infrastructure"
```

## 5. Task 3: App Shell and Responsive Design System

**Files:**

- Create all Task 3 files.
- Modify `src/app/App.tsx`, `src/app/providers.tsx`, `src/app/router.tsx`, and `src/styles/index.css`.
- Test: `src/layouts/AppShell.test.tsx`, `src/layouts/MobileBottomNav.test.tsx`.

- [ ] **Step 1: Define routes**

Implement protected routes:

```text
/login
/app/overview
/app/library
/app/library/datasets
/app/library/documents/:documentId
/app/library/documents/:documentId/preview
/app/chat/new
/app/chat/:conversationId
/app/interview
/app/interview/new
/app/interview/sessions/:sessionId
/app/interview/sessions/:sessionId/feedback
/app/interview/review-items
/app/settings/*
```

Redirect `/` to `/app/overview`, and redirect unauthenticated users to `/login`.

- [ ] **Step 2: Implement the design tokens**

Use CSS variables matching the approved design:

```css
:root {
  --mv-ink: #18212f;
  --mv-muted: #697586;
  --mv-line: #e3e7ed;
  --mv-canvas: #f4f6f8;
  --mv-nav: #172230;
  --mv-blue: #2563c7;
  --mv-green: #1e8e5a;
  --mv-orange: #b65d2d;
}
```

Define breakpoints at `768px`, `980px`, and `1200px`. Do not use viewport-scaled font sizes.

- [ ] **Step 3: Implement desktop and mobile shells**

`AppShell` must render:

- Desktop sidebar at `>= 768px`.
- Collapsed icon sidebar between `768px` and `980px`.
- Mobile bottom nav below `768px`.
- A compact topbar.
- Main content without horizontal overflow.

`AppShell.test.tsx` must assert that the active route marks the correct nav item and that the shell renders children.

- [ ] **Step 4: Implement shared states and primitives**

Build `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`, buttons, inputs, tabs, drawer, dialog, tooltip, and `CommandMenu`. Icon-only buttons must have an `aria-label`.

- [ ] **Step 5: Run visual baseline**

Run:

```bash
pnpm dev --host 127.0.0.1
```

Check `/app/overview` at `1280x900`, `980x900`, and `390x844`. The page must not scroll horizontally.

- [ ] **Step 6: Commit**

```bash
git add mind_vault_web
git commit -m "feat(web): add responsive app shell"
```

## 6. Task 4: Auth, Overview, and Knowledge Base

**Files:**

- Create Task 4 files.
- Modify `src/app/router.tsx`.
- Test: `src/pages/auth/LoginPage.test.tsx`, `src/features/documents/UploadQueue.test.tsx`, `src/pages/library/LibraryPage.test.tsx`.

- [ ] **Step 1: Implement login**

`LoginPage` calls `POST /auth/dev-login` in development, stores the returned token and user, then redirects to the saved route or `/app/overview`. Display loading and API error states without losing the intended redirect.

- [ ] **Step 2: Implement overview**

Match the approved `dashboard-design.html` structure:

- Greeting and upload action.
- Main quick question panel.
- Prompt chips.
- Three statistics.
- Recent files.
- Continue interview card.
- Review items card.

Use independent TanStack Query hooks so one failed widget does not blank the whole page.

- [ ] **Step 3: Implement library**

Implement file search, status/type/dataset filters, sorting, list/table view, batch action menu, empty state, and error retry. The mobile layout must turn filters into a drawer and keep the file table usable without page-level horizontal overflow.

- [ ] **Step 4: Implement upload flow**

Add drag-and-drop and file picker. Validate the P0 extensions and 100MB limit before enqueueing. Render upload progress, processing status, failed stage, retry, cancel, and refresh-on-ready.

- [ ] **Step 5: Implement datasets, folders, tags, archive**

Use tab navigation under `/app/library`. Dataset create/edit/delete uses dialogs with Zod validation. Folders and tags use the mock adapter until matching backend endpoints exist. Archive is a filtered document view with restore action represented by the same adapter boundary.

- [ ] **Step 6: Implement document detail and preview**

Document detail shows metadata, tags, chapter list, index stages, coverage percentage, and preview entry. Preview supports locator types `page`, `slide`, `sheet/cellRange`, `lineStart/lineEnd`, and `jsonPath`. On mobile, preview opens as a full-screen route.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test --run
git add mind_vault_web
git commit -m "feat(web): add overview and knowledge base"
```

## 7. Task 5: Grounded Chat and Citation Preview

**Files:**

- Create Task 5 files.
- Modify `src/app/router.tsx`.
- Test: `src/features/chat/chat-stream.test.ts`, `src/components/citation-card/CitationCard.test.tsx`, `src/pages/chat/ChatPage.test.tsx`.

- [ ] **Step 1: Write chat stream reducer tests**

Given `message_start`, token, citation, status, done, and error events, assert the reducer produces:

```ts
{
  answer: 'combined token text',
  citations: [citation],
  status: 'done',
  error: undefined
}
```

When an error occurs after tokens, the answer remains available and the UI exposes retry/continue actions.

- [ ] **Step 2: Implement chat state**

Create `ChatComposer`, `MessageList`, `MessageBubble`, `CitationCard`, `CitationSidePanel`, `RelatedPrompts`, and `RetrievalSummary`. Keep current scope, current conversation, draft, and stream status in the feature boundary; cache conversation history with TanStack Query.

- [ ] **Step 3: Implement PC chat layout**

Match the approved revision:

- Compact page header.
- Three-column work area without an outer floating card.
- Conversation history on the left.
- Message stream in the center.
- Citations and retrieval process on the right.
- No fixed empty vertical area after the answer.

- [ ] **Step 4: Implement mobile chat layout**

Hide the conversation list and citation side panel below `768px`. Open them as drawers. Keep the composer fixed above the safe area and make citations expandable inline.

- [ ] **Step 5: Implement Markdown and citations**

Render headings, lists, code, tables, and links with `react-markdown` + `remark-gfm`. Citation cards must show file, locator, excerpt, and a button that opens `DocumentPreview` with the exact locator.

- [ ] **Step 6: Implement chat actions**

Support new conversation, history load, regenerate, copy answer, favorite, positive/negative feedback, scope change, related prompt, and retry after interrupted SSE.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test --run
git add mind_vault_web
git commit -m "feat(web): add grounded chat experience"
```

## 8. Task 6: Interview, Feedback, and Review

**Files:**

- Create Task 6 files.
- Modify `src/app/router.tsx`.
- Test: `src/features/interview/interview-stream.test.ts`, `src/pages/interview/InterviewSessionPage.test.tsx`, `src/pages/interview/InterviewFeedbackPage.test.tsx`.

- [ ] **Step 1: Implement new interview form**

Use Zod to validate dataset, job title, mode, question count, difficulty, and answer mode. Prevent submit when no dataset is selected and display field-level errors.

- [ ] **Step 2: Implement interview overview**

Render continue training, recent sessions, scores, weak-point trend, and links to review items. Handle no sessions with an actionable empty state.

- [ ] **Step 3: Implement interview SSE**

Reuse `useSse` with an interview event adapter. Persist the current session id and answer draft in session storage. A network interruption must retain the current question and typed answer.

- [ ] **Step 4: Implement session page**

Render question progress, elapsed time, auto-save state, answer editor, submit answer, skip, end session, and evidence references. On mobile, put feedback dimensions below the question.

- [ ] **Step 5: Implement feedback**

Render factual accuracy, structure, technical depth, quantified result, clarity, evidence references, next-step advice, and actions to favorite or review an item.

- [ ] **Step 6: Implement review items**

List wrong answers with filter by weakness and status. Support open detail, submit review answer, mark mastered, and return to interview.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test --run
git add mind_vault_web
git commit -m "feat(web): add interview and review flows"
```

## 9. Task 7: Settings, Export, and Completion States

**Files:**

- Create Task 7 files.
- Modify `src/app/router.tsx`.
- Test: `src/features/settings/settings-form.test.tsx`, `src/features/export/export-status.test.tsx`.

- [ ] **Step 1: Implement settings navigation**

Create settings tabs for account, preferences, data/export, and privacy. On mobile, render them as a select-like navigation header.

- [ ] **Step 2: Implement account and preferences**

Support display name, default dataset scope, always-show-citations toggle, answer style, and model preference. Use optimistic form state and show a saved confirmation only after the mutation succeeds.

- [ ] **Step 3: Implement export**

Start an async export task with `POST /data/export` when available, otherwise use the mock adapter. Poll status every `2_000ms`, render queued/running/completed/failed, and expose download only for completed tasks.

- [ ] **Step 4: Implement privacy and destructive actions**

Add privacy explanation, data deletion confirmation dialog, and logout. The delete dialog must require typing `DELETE` before enabling confirmation.

- [ ] **Step 5: Implement not-found and global error boundaries**

Add a route-level not-found page and an app-level error boundary with request id display and reload/retry actions.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm test --run
git add mind_vault_web
git commit -m "feat(web): add settings export and error states"
```

## 10. Task 8: E2E, Accessibility, and Release Verification

**Files:**

- Create `playwright.config.ts`.
- Create all Task 8 E2E files.
- Modify `package.json`, `README.md`, and `.env.example`.

- [ ] **Step 1: Configure Playwright**

Use Chromium with base URL `http://127.0.0.1:4173`, start the preview server with:

```bash
pnpm build
pnpm preview --host 127.0.0.1
```

Add projects for `desktop` viewport `1280x900`, `tablet` viewport `980x900`, and `mobile` viewport `390x844`.

- [ ] **Step 2: Add auth E2E**

Mock `POST /auth/dev-login` and `GET /me`. Assert login redirect, refresh persistence, and redirect back to the originally requested route.

- [ ] **Step 3: Add library E2E**

Mock document list, upload, status polling, and retry. Assert upload progress, processing state, ready state, failure state, and retry.

- [ ] **Step 4: Add chat E2E**

Mock conversation history and an SSE response containing tokens, citations, done, and interrupted error. Assert the answer remains visible after interruption and citation navigation reaches preview.

- [ ] **Step 5: Add interview E2E**

Mock session create, question stream, answer stream, finish, feedback, and review item update. Assert the full create -> answer -> finish -> favorite flow.

- [ ] **Step 6: Add responsive checks**

Assert:

```ts
expect(await page.locator('body').evaluate((node) => node.scrollWidth))
  .toBeLessThanOrEqual(viewport.width);
```

Check that desktop sidebar, mobile bottom navigation, chat drawers, upload dialog, and fixed composer render at their intended breakpoints.

- [ ] **Step 7: Run release verification**

```bash
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build
pnpm exec playwright test
```

Expected: all commands pass. Save Playwright screenshots for overview, library, chat, interview, and settings at desktop and mobile sizes.

- [ ] **Step 8: Commit**

```bash
git add mind_vault_web
git commit -m "test(web): verify responsive product flows"
```

## 11. Definition of Done

- [ ] `mind_vault_web` installs, type-checks, tests, builds, and previews independently.
- [ ] PC uses the approved compact header, side navigation, and integrated three-column chat work area.
- [ ] Mobile uses the approved bottom navigation and drawer-based secondary panels.
- [ ] Overview matches `dashboard-design.html`.
- [ ] Upload, processing status, retry, document detail, and locator preview work.
- [ ] Chat supports SSE, Markdown, citations, related prompts, feedback, and interruption recovery.
- [ ] Interview supports setup, streaming questions, answers, follow-up, finish, feedback, and review items.
- [ ] Settings supports account, preferences, privacy, export status, and destructive action confirmation.
- [ ] Empty, loading, error, unauthorized, and success states are implemented.
- [ ] Required E2E flows pass at desktop, tablet, and mobile viewports.

