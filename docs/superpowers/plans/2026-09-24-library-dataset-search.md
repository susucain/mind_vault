# Library Dataset Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the knowledge-library page scale to many datasets through in-page search and make documents load ten at a time as the user scrolls.

**Architecture:** Keep the existing dataset search API and add a client-side selector panel. Replace one-shot document loading with page state (`page`, `hasMore`, `loadingMore`); document SSE events refresh the loaded first page while preserving the selected dataset. Upload stays above the selected dataset's document list.

**Tech Stack:** WeChat Mini Program, Vant Weapp, TypeScript, existing NestJS dataset/document APIs, `tsx`.

---

### Task 1: Add Pure Document Pagination State

**Files:**
- Create: `mind_vault_miniapp/utils/document-pagination.ts`
- Create: `mind_vault_miniapp/utils/document-pagination.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
expect(appendDocumentPage([], [{ id: 'doc_1' }], 1, 10)).toEqual({
  items: [{ id: 'doc_1' }],
  nextPage: 2,
  hasMore: false,
});
```

Add a duplicate-ID case and a page-one replacement case.

- [ ] **Step 2: Run test**

Run: `pnpm exec tsx utils/document-pagination.test.ts`

- [ ] **Step 3: Implement pure helpers**

```ts
export function appendDocumentPage<T extends { id: string }>(
  current: T[],
  incoming: T[],
  page: number,
  pageSize: number,
) {
  const items = page === 1 ? incoming : dedupeById([...current, ...incoming]);
  return {
    items,
    nextPage: page + 1,
    hasMore: incoming.length === pageSize,
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm exec tsx utils/document-pagination.test.ts`

### Task 2: Add Dataset Selector Search State

**Files:**
- Modify: `mind_vault_miniapp/services/datasets.ts`
- Modify: `mind_vault_miniapp/pages/library/library.ts`

- [ ] **Step 1: Extend dataset service**

```ts
export function listDatasets(input: { name?: string; pageSize?: number } = {}) {
  const params = [`page=1`, `pageSize=${input.pageSize ?? 20}`];
  if (input.name?.trim()) params.push(`name=${encodeURIComponent(input.name.trim())}`);
  return request<PaginatedResponse<Dataset>>({ path: `/datasets?${params.join('&')}` });
}
```

- [ ] **Step 2: Implement selector state**

Add `showDatasetSelector`, `datasetQuery`, `datasetResults`, and
`searchingDatasets`. Debounce input by 300 ms and use the existing API.

- [ ] **Step 3: Implement selection**

Selecting a result closes the panel, resets document pagination, and loads the
first page for the dataset.

### Task 3: Replace One-Shot Document Loading With Infinite Scroll

**Files:**
- Modify: `mind_vault_miniapp/services/documents.ts`
- Modify: `mind_vault_miniapp/pages/library/library.ts`
- Modify: `mind_vault_miniapp/pages/library/library.wxml`

- [ ] **Step 1: Extend document service**

```ts
export function listDocuments(datasetId?: string, page = 1, pageSize = 10) {
  const query = `?datasetId=${encodeURIComponent(datasetId ?? '')}&page=${page}&pageSize=${pageSize}`;
  return request<PaginatedResponse<DocumentItem>>({ path: `/documents${query}` });
}
```

- [ ] **Step 2: Add document page state**

Add `documentPage`, `hasMoreDocuments`, and `loadingMoreDocuments`.
`loadDocuments(true)` replaces page one; `loadDocuments(false)` appends.

- [ ] **Step 3: Handle scroll end**

```ts
onReachBottom() {
  if (!this.data.hasMoreDocuments || this.data.loadingMoreDocuments) return;
  void this.loadDocuments(false);
}
```

- [ ] **Step 4: Update SSE refresh**

SSE events refresh page one using `loadDocuments(true)` for the currently
selected dataset. Do not reset selection or close the selector panel.

### Task 4: Render The Single-Page Selector And Load State

**Files:**
- Modify: `mind_vault_miniapp/pages/library/library.wxml`
- Modify: `mind_vault_miniapp/pages/library/library.wxss`

- [ ] **Step 1: Replace horizontal dataset strip**

Render a compact current-dataset selector with a search button. Render a
search panel below it when expanded; include result, loading, no-result, and
new-dataset controls.

- [ ] **Step 2: Keep Upload In Context**

Place the upload surface after the selected dataset heading and document count,
before document cards.

- [ ] **Step 3: Add document list footer**

Render a loading indicator while another page loads and an “all loaded” row
when the selected dataset has documents and no more pages.

### Task 5: Verify

**Files:**
- Test: `mind_vault_miniapp/utils/document-pagination.test.ts`

- [ ] **Step 1: Run pagination test**

Run: `pnpm exec tsx utils/document-pagination.test.ts`

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Run formatting and diff checks**

Run: `git diff --check`

- [ ] **Step 4: Commit**

```bash
git add mind_vault_miniapp/services/datasets.ts mind_vault_miniapp/services/documents.ts mind_vault_miniapp/pages/library mind_vault_miniapp/utils/document-pagination.ts mind_vault_miniapp/utils/document-pagination.test.ts
git commit -m "feat(miniapp): 优化资料集搜索与文档分页"
```
