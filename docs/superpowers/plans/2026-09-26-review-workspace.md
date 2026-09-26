# 复习工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建独立复习工作区，支持待复习/已复习分页、详情查看、重新作答评估、60 分自动归档和手动状态管理。

**Architecture:** 后端扩展 ReviewItem 的完成元数据，并新增不可变的 ReviewAttempt 记录每一次复习回答与评估。小程序新增复习列表与详情页面；列表按状态分页，详情读取来源面试轮次，重新评估后由服务端根据四项平均分更新复习状态。

**Tech Stack:** NestJS、TypeORM、class-validator、微信小程序 TypeScript/WXML/WXSS、Vant Weapp、Jest、TypeScript compiler。

---

## 文件结构

- Create: `mind_vault_api/src/interview/entities/review-attempt.entity.ts`
  - 保存每次复习回答、评估、引用、平均分和创建时间。
- Modify: `mind_vault_api/src/interview/entities/review-item.entity.ts`
  - 添加 `completedAt` 与 `lastReviewedAt`。
- Create: `mind_vault_api/src/interview/dto/query-review-items.dto.ts`
  - 校验复习状态分页请求。
- Create: `mind_vault_api/src/interview/dto/submit-review-answer.dto.ts`
  - 校验复习重答内容。
- Create: `mind_vault_api/src/interview/dto/update-review-item.dto.ts`
  - 校验手动复习状态更新。
- Modify: `mind_vault_api/src/interview/interview.module.ts`
  - 注册 ReviewAttempt repository。
- Modify: `mind_vault_api/src/interview/interview.controller.ts`
  - 暴露分页、详情、重答和状态更新接口。
- Modify: `mind_vault_api/src/interview/interview.service.ts`
  - 实现复习数据访问、重答评估、平均分判定与状态更新。
- Modify: `mind_vault_api/src/interview/interview.service.spec.ts`
  - 覆盖 API 服务行为和状态边界。
- Create: `mind_vault_miniapp/pages/review/review.{ts,wxml,wxss,json}`
  - 独立复习队列，状态切换与无限加载。
- Create: `mind_vault_miniapp/pages/review-detail/review-detail.{ts,wxml,wxss,json}`
  - 显示来源题目、历史尝试，处理紧凑的重答操作区。
- Modify: `mind_vault_miniapp/app.json`
  - 注册两个非 tabBar 页面。
- Modify: `mind_vault_miniapp/services/interview.ts`
  - 新增复习列表、详情、重答和状态更新请求。
- Modify: `mind_vault_miniapp/types/interview.ts`
  - 添加 ReviewAttempt、ReviewDetail、分页响应和状态结果类型。
- Create: `mind_vault_miniapp/utils/review-state.ts`
  - 维护列表追加和平均分展示的纯函数。
- Create: `mind_vault_miniapp/utils/review-state.test.ts`
  - 覆盖分页合并和完成判定展示。
- Modify: `mind_vault_miniapp/pages/interview/interview.{ts,wxml,wxss}`
  - 移除底部平铺复习列表，增加复习入口。
- Modify: `mind_vault_miniapp/pages/home/home.{ts,wxml}`
  - 待复习区域提供查看详情与查看全部入口。

当前工作区包含 chat、memory、面试导航、超时配置与资料范围功能的未提交改动。实施时必须保留它们；只有与本计划确实重叠的 `home`、`interview`、`services/interview` 和 `types/interview` 文件才在理解现有修改后合并编辑。

### Task 1: 后端复习数据模型和分页查询

**Files:**
- Create: `mind_vault_api/src/interview/entities/review-attempt.entity.ts`
- Modify: `mind_vault_api/src/interview/entities/review-item.entity.ts`
- Create: `mind_vault_api/src/interview/dto/query-review-items.dto.ts`
- Modify: `mind_vault_api/src/interview/interview.module.ts`
- Modify: `mind_vault_api/src/interview/interview.service.ts`
- Modify: `mind_vault_api/src/interview/interview.service.spec.ts`

- [ ] **Step 1: Write failing pagination tests**

在 `interview.service.spec.ts` 增加以下测试：

```ts
it('lists review items for an owner by status and page', async () => {
  const { service, reviewItems } = buildService();
  reviewItems.findAndCount.mockResolvedValue([[{ id: 'review_1' }], 21]);

  await expect(
    service.listReviewItems('user_1', {
      status: 'COMPLETED',
      page: 2,
      pageSize: 20,
    }),
  ).resolves.toEqual({
    items: [{ id: 'review_1' }],
    total: 21,
    page: 2,
    pageSize: 20,
  });

  expect(reviewItems.findAndCount).toHaveBeenCalledWith({
    where: { ownerId: 'user_1', status: 'COMPLETED' },
    order: { completedAt: 'DESC', createdAt: 'DESC' },
    skip: 20,
    take: 20,
  });
});
```

再添加默认 `PENDING`、待复习按 `createdAt DESC` 排序、owner 过滤的测试。

- [ ] **Step 2: Run focused API test and verify RED**

```bash
cd mind_vault_api
pnpm exec jest --runInBand src/interview/interview.service.spec.ts
```

Expected: FAIL，因为 `listReviewItems` 还不接收分页查询且 repository 没有 `findAndCount` 调用。

- [ ] **Step 3: Add persistence entities and DTO**

创建 ReviewAttempt：

```ts
@Entity('kh_review_attempt')
export class ReviewAttemptEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ name: 'review_item_id', type: 'varchar' })
  reviewItemId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'jsonb' })
  evaluation: InterviewEvaluation;

  @Column({ name: 'citation_ids_json', type: 'jsonb', default: () => "'[]'" })
  citationIds: string[];

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  score: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
```

在 ReviewItem 新增 nullable `completedAt`、`lastReviewedAt`。Query DTO 使用 `@IsIn(['PENDING', 'COMPLETED'])`、`@Type(() => Number)`、`@Min(1)`、`@Max(50)`，默认值通过服务层处理。

- [ ] **Step 4: Implement paginated list service**

将 `listReviewItems` 改为：

```ts
async listReviewItems(
  ownerId: string,
  query: { status?: 'PENDING' | 'COMPLETED'; page?: number; pageSize?: number },
) {
  const status = query.status ?? 'PENDING';
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const [items, total] = await this.reviewItems.findAndCount({
    where: { ownerId, status },
    order:
      status === 'COMPLETED'
        ? { completedAt: 'DESC', createdAt: 'DESC' }
        : { createdAt: 'DESC' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total, page, pageSize };
}
```

注册 `ReviewAttemptEntity`，但此任务不实现详情与写入逻辑。

- [ ] **Step 5: Run focused API tests and build**

```bash
cd mind_vault_api
pnpm exec jest --runInBand src/interview/interview.service.spec.ts
pnpm run build
```

Expected: PASS。

- [ ] **Step 6: Commit the data/query slice**

```bash
git add mind_vault_api/src/interview
git commit -m "feat(api): 支持复习项分页查询"
```

### Task 2: 后端复习详情、重答和状态迁移

**Files:**
- Create: `mind_vault_api/src/interview/dto/submit-review-answer.dto.ts`
- Create: `mind_vault_api/src/interview/dto/update-review-item.dto.ts`
- Modify: `mind_vault_api/src/interview/interview.controller.ts`
- Modify: `mind_vault_api/src/interview/interview.service.ts`
- Modify: `mind_vault_api/src/interview/interview.service.spec.ts`

- [ ] **Step 1: Write failing review completion tests**

覆盖以下最小行为：

```ts
it('completes a review item after a score of 60 or more', async () => {
  const { service, reviewItems, attempts, agent } = buildReviewService();
  agent.evaluate.mockResolvedValue({
    evaluation: {
      accuracy: 60,
      depth: 60,
      structure: 60,
      clarity: 60,
      strengths: [],
      gaps: [],
      followUp: '继续说明',
      reviewItems: [],
    },
    citations: [],
  });

  const result = await service.submitReviewAnswer('user_1', 'review_1', {
    answer: '新的回答',
  });

  expect(result.score).toBe(60);
  expect(result.autoCompleted).toBe(true);
  expect(reviewItems.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
  );
  expect(attempts.save).toHaveBeenCalled();
});
```

添加低于 60 后保持 `PENDING`、已完成项低分后恢复 `PENDING`、手动完成/恢复、非 owner 返回 NotFound，以及详情包含来源 turn/session/attempts 的测试。

- [ ] **Step 2: Run focused API test and verify RED**

```bash
cd mind_vault_api
pnpm exec jest --runInBand src/interview/interview.service.spec.ts
```

Expected: FAIL，因为详情、重答和状态更新方法尚不存在。

- [ ] **Step 3: Add DTOs and controller routes**

创建：

```ts
export class SubmitReviewAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  answer: string;
}

export class UpdateReviewItemDto {
  @IsIn(['PENDING', 'COMPLETED'])
  status: 'PENDING' | 'COMPLETED';
}
```

新增路由：

```ts
@Get('review-items/:id')
getReviewItem(...)

@Post('review-items/:id/answers')
submitReviewAnswer(...)

@Patch('review-items/:id')
updateReviewItem(...)
```

保证 `review-items/:id` 定义在 `review-items` 之后不影响路由匹配，并导入 `Patch`。

- [ ] **Step 4: Implement source lookup, attempt persistence and 60-point rule**

新增 `findReviewItem(ownerId, id)`，按 owner 查询，不存在时抛 NotFound。

详情加载：

```ts
const item = await this.findReviewItem(ownerId, id);
const sourceTurn = await this.turns.findOne({
  where: { id: item.sourceTurnId, ownerId },
});
const sourceSession = sourceTurn
  ? await this.sessions.findOne({
      where: { id: sourceTurn.sessionId, ownerId },
    })
  : null;
const attempts = await this.reviewAttempts.find({
  where: { reviewItemId: id, ownerId },
  order: { createdAt: 'ASC' },
});
```

重答必须以 `sourceTurn.question` 和 `sourceSession.datasetId` 调用 `agent.evaluate`。计算：

```ts
const score =
  (evaluation.accuracy +
    evaluation.depth +
    evaluation.structure +
    evaluation.clarity) /
  4;
const completed = score >= 60;
```

保存 ReviewAttempt。将 item 的 `status` 更新为 `COMPLETED` 或 `PENDING`，始终设置 `lastReviewedAt`，仅完成时设置 `completedAt`，低分时清空 `completedAt`。

手动更新状态同样写 `lastReviewedAt`；完成时写入当前时间，恢复待复习时清空完成时间。

- [ ] **Step 5: Run focused API tests and build**

```bash
cd mind_vault_api
pnpm exec jest --runInBand src/interview/interview.service.spec.ts
pnpm run build
```

Expected: PASS。

- [ ] **Step 6: Commit the review workflow API**

```bash
git add mind_vault_api/src/interview
git commit -m "feat(api): 支持复习重答与完成状态"
```

### Task 3: 小程序复习 API、类型和状态工具

**Files:**
- Modify: `mind_vault_miniapp/services/interview.ts`
- Modify: `mind_vault_miniapp/types/interview.ts`
- Create: `mind_vault_miniapp/utils/review-state.ts`
- Create: `mind_vault_miniapp/utils/review-state.test.ts`

- [ ] **Step 1: Write failing list-state tests**

```ts
it('appends a later page without duplicating review items', () => {
  expect(
    appendReviewPage(
      [{ id: 'review_1' }],
      [{ id: 'review_1' }, { id: 'review_2' }],
    ),
  ).toEqual([{ id: 'review_1' }, { id: 'review_2' }]);
});

it('stops loading once displayed count reaches the total', () => {
  expect(hasMoreReviewItems(20, 20)).toBe(false);
  expect(hasMoreReviewItems(19, 20)).toBe(true);
});
```

- [ ] **Step 2: Run utility test and verify RED**

```bash
cd mind_vault_miniapp
pnpm exec tsx utils/review-state.test.ts
```

Expected: FAIL，因为工具模块尚不存在。

- [ ] **Step 3: Implement types and service calls**

在 `types/interview.ts` 增加：

- `ReviewStatus`
- `ReviewAttempt`
- `ReviewDetail`
- `PaginatedReviewItems`
- `ReviewAnswerResult`

在 `services/interview.ts` 新增：

```ts
listReviewItems(status: ReviewStatus, page = 1, pageSize = 20)
getReviewItem(id: string)
submitReviewAnswer(id: string, answer: string)
updateReviewItemStatus(id: string, status: ReviewStatus)
```

`submitReviewAnswer` 复用 `environment.interviewAnswerTimeout`。

- [ ] **Step 4: Implement and verify review-state utilities**

实现 `appendReviewPage` 去重追加、`hasMoreReviewItems`、`reviewScoreLabel`。运行：

```bash
cd mind_vault_miniapp
pnpm exec tsx utils/review-state.test.ts
pnpm run typecheck
```

Expected: PASS。

- [ ] **Step 5: Commit the miniapp review data slice**

```bash
git add mind_vault_miniapp/services/interview.ts mind_vault_miniapp/types/interview.ts mind_vault_miniapp/utils/review-state.ts mind_vault_miniapp/utils/review-state.test.ts
git commit -m "feat(miniapp): 添加复习数据访问与分页状态"
```

### Task 4: 独立复习列表页

**Files:**
- Create: `mind_vault_miniapp/pages/review/review.ts`
- Create: `mind_vault_miniapp/pages/review/review.wxml`
- Create: `mind_vault_miniapp/pages/review/review.wxss`
- Create: `mind_vault_miniapp/pages/review/review.json`
- Modify: `mind_vault_miniapp/app.json`
- Modify: `mind_vault_miniapp/pages/interview/interview.ts`
- Modify: `mind_vault_miniapp/pages/interview/interview.wxml`
- Modify: `mind_vault_miniapp/pages/interview/interview.wxss`
- Modify: `mind_vault_miniapp/pages/home/home.ts`
- Modify: `mind_vault_miniapp/pages/home/home.wxml`

- [ ] **Step 1: Register routes and navigation entry points**

在 `app.json` 的 `pages` 中添加：

```json
"pages/review/review",
"pages/review-detail/review-detail"
```

两个页面都不是 tabBar。面试页头部新增紧凑“复习”入口；首页待复习标题提供“查看全部”，列表项点击进入详情。入口使用 `wx.navigateTo`。

- [ ] **Step 2: Implement review list data lifecycle**

列表页 `data` 包含：

```ts
activeStatus: 'PENDING' as ReviewStatus,
items: [] as ReviewItem[],
page: 1,
total: 0,
hasMore: true,
loading: true,
loadingMore: false,
error: '',
```

实现 `loadReviews(reset: boolean)`：重置时请求第一页；加载更多时请求 `page + 1`；成功后调用 `appendReviewPage`、更新 `hasMore`；失败时保留已有 items。`onReachBottom` 仅在 `hasMore && !loading && !loadingMore` 时触发。切换状态时重置并重载。

- [ ] **Step 3: Build list page UI**

页面包含：

- 标题“复习”与待复习数量。
- 待复习/已复习文本标签切换。
- 单项卡片展示 title、reason、状态、来源模式与时间。
- 加载、空状态、错误、加载更多、已加载全部状态。

卡片只用于重复条目，不将整个页面包在浮动卡片中；使用既有绿色、青灰色和低强调橙色反馈色。

- [ ] **Step 4: Run typecheck and manually inspect list states**

```bash
cd mind_vault_miniapp
pnpm run typecheck
```

Use WeChat developer tools to inspect PENDING、COMPLETED、empty、loadingMore 和 error 状态，确认滚动到底不重复请求。

- [ ] **Step 5: Commit list page**

```bash
git add mind_vault_miniapp/app.json mind_vault_miniapp/pages/review mind_vault_miniapp/pages/interview mind_vault_miniapp/pages/home
git commit -m "feat(miniapp): 添加独立复习列表页"
```

### Task 5: 复习详情、重答和紧凑操作区

**Files:**
- Create: `mind_vault_miniapp/pages/review-detail/review-detail.ts`
- Create: `mind_vault_miniapp/pages/review-detail/review-detail.wxml`
- Create: `mind_vault_miniapp/pages/review-detail/review-detail.wxss`
- Create: `mind_vault_miniapp/pages/review-detail/review-detail.json`

- [ ] **Step 1: Implement detail loading and display state**

从 query 读取 `id`。`onLoad` 为空时显示错误；有效时请求 `getReviewItem(id)`。详情渲染来源状态、title、reason、来源题目、来源回答、来源评分和历史 ReviewAttempt。

- [ ] **Step 2: Implement re-answer state transitions**

`submitReviewAnswer`：

1. 拒绝空回答和重复提交。
2. 使用 `submitReviewAnswer(id, answer)`。
3. 成功后更新 detail.item、追加 attempt、显示最新 attempt、清空 input。
4. `autoCompleted` 为 true 时显示“本次复习已完成”，否则显示“保留待复习，请结合反馈继续练习”。
5. 失败时保留 input 和当前详情，调用 `showRequestError`。

`markCompleted` 与 `restorePending` 使用状态更新接口；请求中禁用所有状态操作。

- [ ] **Step 3: Build compact action UI**

详情底部操作区：

```css
.review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
  margin-top: 20rpx;
}

.review-action-primary,
.review-action-secondary {
  min-height: 72rpx;
  padding: 0 28rpx;
  font-size: 26rpx;
  border-radius: 4rpx;
}
```

主按钮不使用 `block`，次按钮不使用大号文本。手动完成/恢复待复习放入详情状态区作为低强调文本按钮，不与重评估同排。

- [ ] **Step 4: Run typecheck and manual acceptance**

```bash
cd mind_vault_miniapp
pnpm run typecheck
```

在开发者工具中确认：高分自动完成、低分保持待复习、手动完成、恢复待复习、评估失败保留输入、历史尝试可见。

- [ ] **Step 5: Commit review detail page**

```bash
git add mind_vault_miniapp/pages/review-detail
git commit -m "feat(miniapp): 支持复习重答与评估"
```

### Task 6: 全量验证与提交审查

**Files:**
- Modify only when tests find a concrete defect.

- [ ] **Step 1: Run API suite and build**

```bash
cd mind_vault_api
pnpm exec jest --runInBand
pnpm run build
```

Expected: all suites PASS。

- [ ] **Step 2: Run miniapp checks**

```bash
cd mind_vault_miniapp
pnpm run typecheck
pnpm exec tsx utils/review-state.test.ts
pnpm exec tsx services/interview.test.ts
pnpm exec tsx utils/sessions.test.ts
pnpm exec prettier --check pages/review pages/review-detail services/interview.ts types/interview.ts utils/review-state.ts utils/review-state.test.ts
```

Expected: all commands PASS。

- [ ] **Step 3: Inspect final change boundaries**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm no unrelated memory/chat/资料范围 modification was reverted or staged accidentally.

- [ ] **Step 4: Commit only verified regression fixes**

```bash
git add <verified-fix-files>
git commit -m "fix: 完善复习工作区回归"
```

Create this commit only if Task 6 uncovered a real defect.
