# 知识库上传与文档状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将知识库文档状态改为无背景的图标加文案，并把上传流程改为聚焦上传弹窗，上传后回到「全部文件」并在主表格显示上传状态。

**Architecture:** 保留现有 `useUploadQueue` 的上传、轮询和重试协议；新增纯展示组件统一文档状态映射，并在 `LibraryPage` 中把 Zustand 上传项映射为临时文档行，与服务端文档按 `documentId` 去重合并。`UploadPanel` 只负责选择资料集和文件，作为 Radix Dialog 内容使用，入队后通知页面关闭弹窗并复位筛选。

**Tech Stack:** React 19, TypeScript, Zustand, TanStack Query, Radix Dialog, lucide-react, Vitest, Testing Library, Playwright.

---

### Task 1: 为状态指示器建立可测试的状态映射

**Files:**
- Create: `mind_vault_web/src/features/documents/DocumentStatusIndicator.tsx`
- Create: `mind_vault_web/src/features/documents/DocumentStatusIndicator.test.tsx`
- Modify: `mind_vault_web/src/features/documents/document-utils.ts`

- [ ] **Step 1: Write the failing tests**

在 `DocumentStatusIndicator.test.tsx` 覆盖：

```tsx
it('renders icon and label without a status background', () => {
  render(<DocumentStatusIndicator status="ready" />);
  expect(screen.getByText('可问答')).toBeInTheDocument();
  expect(screen.getByTestId('document-status-icon')).toHaveAttribute('aria-label', '可问答');
  expect(screen.getByText('可问答').closest('[data-status-tone]')).toHaveAttribute('data-status-tone', 'success');
});

it.each([
  ['pending', '等待处理'],
  ['uploading', '上传中'],
  ['processing', '处理中'],
  ['failed', '处理失败'],
  ['archived', '已归档'],
] as const)('maps %s to %s', (status, label) => {
  render(<DocumentStatusIndicator status={status} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
```

Run: `cd mind_vault_web && pnpm vitest run src/features/documents/DocumentStatusIndicator.test.tsx`

Expected: FAIL because the component and its status mapping do not exist.

- [ ] **Step 2: Add the shared status mapping**

在 `document-utils.ts` 新增纯函数，避免把 `Document` 和上传队列的映射散落在 JSX：

```ts
export const documentStatusPresentation = {
  pending: { label: '等待处理', tone: 'pending', icon: Clock3 },
  uploading: { label: '上传中', tone: 'uploading', icon: Upload },
  processing: { label: '处理中', tone: 'processing', icon: LoaderCircle },
  ready: { label: '可问答', tone: 'success', icon: CircleCheck },
  failed: { label: '处理失败', tone: 'danger', icon: TriangleAlert },
  archived: { label: '已归档', tone: 'archived', icon: Archive },
  deleted: { label: '已删除', tone: 'danger', icon: CircleX },
} as const;
```

保留 `documentStatusLabel` 和 `documentTone` 的外部接口，改为读取这张映射表；`queued` 只在临时上传行转换为 `pending`。

- [ ] **Step 3: Implement the indicator**

创建 `DocumentStatusIndicator`，支持 `DocumentStatus`、`'queued'` 和可选 `compact`：

```tsx
export function DocumentStatusIndicator({ status }: { status: DocumentStatus | 'queued' }) {
  const resolved = status === 'queued' ? 'pending' : status;
  const presentation = documentStatusPresentation[resolved];
  const Icon = presentation.icon;
  return (
    <span className={`document-status document-status--${presentation.tone}`} data-status-tone={presentation.tone}>
      <Icon aria-label={presentation.label} data-testid="document-status-icon" size={16} />
      <span>{presentation.label}</span>
    </span>
  );
}
```

- [ ] **Step 4: Run the focused test**

Run: `cd mind_vault_web && pnpm vitest run src/features/documents/DocumentStatusIndicator.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mind_vault_web/src/features/documents/DocumentStatusIndicator.tsx \
  mind_vault_web/src/features/documents/DocumentStatusIndicator.test.tsx \
  mind_vault_web/src/features/documents/document-utils.ts
git commit -m "feat(web): add inline document status indicator"
```

### Task 2: 将上传面板改造成只负责选择文件的弹窗内容

**Files:**
- Modify: `mind_vault_web/src/features/documents/UploadPanel.tsx`
- Modify: `mind_vault_web/src/components/ui.tsx`
- Modify: `mind_vault_web/src/styles/index.css`
- Modify: `mind_vault_web/src/features/documents/UploadPanel.test.tsx`

- [ ] **Step 1: Write the failing dialog behavior tests**

新增测试验证：

```tsx
it('renders the dataset selector and does not render an upload queue', () => {
  render(<UploadPanel datasets={[dataset]} onCreateDataset={vi.fn()} onEnqueued={vi.fn()} />);
  expect(screen.getByLabelText('上传到资料集')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '上传队列' })).not.toBeInTheDocument();
});

it('closes through the enqueue callback after selecting files', async () => {
  const onEnqueued = vi.fn();
  render(<UploadPanel datasets={[dataset]} onCreateDataset={vi.fn()} onEnqueued={onEnqueued} />);
  await userEvent.upload(screen.getByLabelText('选择文件'), new File(['content'], 'notes.md', { type: 'text/markdown' }));
  expect(onEnqueued).toHaveBeenCalledWith('dataset-1');
});
```

Run: `cd mind_vault_web && pnpm vitest run src/features/documents/UploadPanel.test.tsx`

Expected: FAIL because `onEnqueued` is not in the component contract and the queue is still rendered.

- [ ] **Step 2: Change the component contract**

将 props 改为：

```ts
export function UploadPanel({
  datasets,
  onCreateDataset,
  onEnqueued,
}: {
  datasets: Dataset[];
  onCreateDataset: () => void;
  onEnqueued: (datasetId: string) => void;
}) { /* ... */ }
```

在 `addFiles` 确认存在文件后调用 `enqueue` 和 `onEnqueued(selectedDatasetId)`，移除 `UploadQueue` 导入与渲染。保留 `useEffect` 的 query invalidation。

- [ ] **Step 3: Make the dialog layout explicit**

在 `ui.tsx` 为 `Dialog` 内容增加 `data-dialog="standard"`，并为上传弹窗包一层 `.upload-dialog`，内容按标题、资料集选择、拖拽区、限制说明分层。不要在弹窗中放队列列表或进度条。

- [ ] **Step 4: Add the visual styles**

在 `index.css` 新增：

```css
.upload-dialog { width: min(calc(100% - 32px), 560px); padding: 22px; }
.upload-dialog__body { display: grid; gap: 18px; }
.upload-dialog__hint { margin: 0; color: var(--mv-muted); font-size: .75rem; line-height: 1.5; }
.upload-dialog .drop-zone { min-height: 190px; flex-direction: column; justify-content: center; text-align: center; }
```

移动端将宽度改为 `calc(100% - 20px)`，避免弹窗内容横向溢出。

- [ ] **Step 5: Run the focused test**

Run: `cd mind_vault_web && pnpm vitest run src/features/documents/UploadPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mind_vault_web/src/features/documents/UploadPanel.tsx \
  mind_vault_web/src/components/ui.tsx \
  mind_vault_web/src/styles/index.css \
  mind_vault_web/src/features/documents/UploadPanel.test.tsx
git commit -m "feat(web): move document upload into focused dialog"
```

### Task 3: 在主表格显示本地上传状态并复位筛选

**Files:**
- Modify: `mind_vault_web/src/pages/library/LibraryPage.tsx`
- Modify: `mind_vault_web/src/pages/library/LibraryPage.test.tsx`
- Modify: `mind_vault_web/src/features/documents/queries.ts` only if a query helper is needed

- [ ] **Step 1: Write failing page tests**

补充测试验证：

```tsx
it('opens the upload dialog and resets to all files after enqueue', async () => {
  renderPage({ search: '旧搜索', datasetId: 'dataset-1' });
  await userEvent.click(screen.getByRole('button', { name: '上传' }));
  expect(screen.getByRole('dialog', { name: '上传文件' })).toBeInTheDocument();
  await userEvent.upload(screen.getByLabelText('选择文件'), new File(['x'], 'new.md'));
  expect(screen.getByRole('heading', { name: '全部文件' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('')).toBeInTheDocument();
});

it('renders queued uploads in the document table and never inside the dialog', async () => {
  renderPage();
  await userEvent.click(screen.getByRole('button', { name: '上传' }));
  await userEvent.upload(screen.getByLabelText('选择文件'), new File(['x'], 'new.md'));
  expect(screen.getByText('new.md')).toBeInTheDocument();
  expect(screen.getByText('等待处理')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '上传队列' })).not.toBeInTheDocument();
});
```

Run: `cd mind_vault_web && pnpm vitest run src/pages/library/LibraryPage.test.tsx`

Expected: FAIL because the page still toggles an inline panel and ignores local upload items.

- [ ] **Step 2: Add a local row adapter**

In `LibraryPage.tsx` add:

```ts
function queuedUploadToDocument(item: QueuedUpload): Document {
  return {
    id: `local:${item.localId}`,
    title: item.file.name,
    status: item.status === 'queued' ? 'pending' : item.status,
    sourceFileName: item.file.name,
    sourceFileSize: String(item.file.size),
    sourceFileExtension: fileExtension(item.file.name),
    datasetId: item.datasetId,
  };
}
```

Use `useUploadStore` to read items, merge local rows before server rows, and remove a local row from the display once its `documentId` is present in the server response. Preserve the current server filter behavior.

- [ ] **Step 3: Replace inline toggle with `Dialog`**

Wrap `UploadPanel` in the existing `Dialog` component:

```tsx
<Dialog onOpenChange={setUploadOpen} open={uploadOpen} title="上传文件">
  <UploadPanel
    datasets={datasets.data?.items ?? []}
    onCreateDataset={() => setDatasetDialogOpen(true)}
    onEnqueued={() => {
      setUploadOpen(false);
      setDatasetId('');
      setSearch('');
      setPage(1);
    }}
  />
</Dialog>
```

Do not render `UploadQueue` from `LibraryPage` or `UploadPanel`.

- [ ] **Step 4: Replace table status cell**

Use `<DocumentStatusIndicator status={documentStatus(document)} />` in the status column. Keep dataset tags, size and date unchanged; local rows may use `时间未知` until the server row replaces them.

- [ ] **Step 5: Run page tests**

Run: `cd mind_vault_web && pnpm vitest run src/pages/library/LibraryPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mind_vault_web/src/pages/library/LibraryPage.tsx \
  mind_vault_web/src/pages/library/LibraryPage.test.tsx
git commit -m "feat(web): show uploads in all-files table"
```

### Task 4: Full verification and browser visual QA

**Files:**
- Modify: `mind_vault_web/e2e/app-shell.spec.ts` only if an existing selector needs updating.

- [ ] **Step 1: Run web unit tests**

Run: `cd mind_vault_web && pnpm test -- --run`

Expected: PASS with no test failures.

- [ ] **Step 2: Run typecheck and lint**

Run:

```bash
cd mind_vault_web
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Run production build**

Run: `cd mind_vault_web && pnpm build`

Expected: Vite emits a production bundle and exits 0.

- [ ] **Step 4: Run the dev server and inspect both viewports**

Run: `cd mind_vault_web && pnpm dev --host 127.0.0.1`

Check at desktop and mobile viewport:

- status column has icons and text with no background pills;
- clicking `上传` opens centered `上传文件` dialog;
- dialog contains dataset select and drop area but no `上传队列`;
- selecting a file closes dialog and table resets to `全部文件`;
- local upload row stays in the table and does not overlap other columns;
- mobile dialog stays within the viewport.

- [ ] **Step 5: Commit any selector-only e2e adjustment**

Only if the existing e2e suite requires a selector update:

```bash
git add mind_vault_web/e2e/app-shell.spec.ts
git commit -m "test(web): update library upload selectors"
```
