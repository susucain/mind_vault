# Streaming Markdown Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing chat SSE path reliable and render completed Markdown answers in the miniapp without introducing model token streaming.

**Architecture:** Keep `ChatService.ask()` as the complete-answer transaction. Harden the miniapp SSE parser and expose request cancellation, add early SSE stage/context events plus heartbeat headers on the backend, and render only completed Markdown through a focused miniapp component boundary.

**Tech Stack:** NestJS/Express, TypeScript, WeChat Mini Program, Jest, `rich-text` node rendering.

---

### Task 1: Harden SSE parsing and cancellation

**Files:**
- Modify: `mind_vault_miniapp/utils/sse.ts`
- Modify: `mind_vault_miniapp/services/chat.ts`
- Test: `mind_vault_miniapp/utils/sse.test.ts`
- Test: `mind_vault_miniapp/services/chat.test.ts`

- [ ] Write failing tests for CRLF, comments, multiline data, and UTF-8 split boundaries.
- [ ] Run `pnpm test:sse` and verify the new cases fail.
- [ ] Implement byte-safe decoding, SSE framing, and an `{ promise, abort }` request handle.
- [ ] Run SSE and service tests.

### Task 2: Add backend stage events and heartbeat-safe headers

**Files:**
- Modify: `mind_vault_api/src/chat/chat.controller.ts`
- Test: `mind_vault_api/src/chat/chat.controller.spec.ts`

- [ ] Write failing controller tests for headers, early stage/context events, heartbeat, and terminal events.
- [ ] Run the focused Jest test and verify failure.
- [ ] Add conservative stage events before/around the existing complete `ask()` call, early context metadata where available, heartbeat, and disconnect cleanup.
- [ ] Run the focused controller test.

### Task 3: Add completed-answer Markdown nodes

**Files:**
- Create: `mind_vault_miniapp/utils/markdown.ts`
- Create: `mind_vault_miniapp/utils/markdown.test.ts`
- Modify: `mind_vault_miniapp/pages/chat/chat.ts`
- Modify: `mind_vault_miniapp/pages/chat/chat.wxml`
- Modify: `mind_vault_miniapp/pages/chat/chat.wxss`

- [ ] Write failing tests for headings, emphasis, lists, code blocks, quotes, links, and unsafe HTML.
- [ ] Run the focused test and verify failure.
- [ ] Implement a small safe Markdown subset into `rich-text` nodes.
- [ ] Render nodes only after `done`; keep streaming content as plain text.
- [ ] Run miniapp typecheck and Markdown tests.

### Task 4: Verify the complete phase

- [ ] Run backend tests and build.
- [ ] Run miniapp tests and typecheck.
- [ ] Review the diff for unrelated changes and confirm the stream protocol remains backward compatible.
