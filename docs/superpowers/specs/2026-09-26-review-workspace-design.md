# 复习工作区设计

## 背景

当前待复习项仅平铺在面试训练页底部，只能展示待复习标题与原因。现有实现没有分页、详情、已复习归档、重新作答或再次评估能力。

数据模型已经有 `PENDING` 和 `COMPLETED` 两种状态，但后端只查询 `PENDING`，小程序也没有任何状态更新入口。

## 目标

- 将复习从面试训练页底部列表升级为独立复习工作区。
- 支持待复习、已复习两个分页列表，并在滚动到底时继续加载。
- 支持查看原始题目、原始回答、原始评估和全部复习尝试。
- 支持重新回答，并使用当前面试评估能力重新评分。
- 四项评分平均分达到或超过 60 时，自动标记为已复习。
- 低于 60 分时保留待复习，展示新的反馈。
- 支持手动标记已复习；已复习条目再次练习且低于 60 分时重新回到待复习。

## 非目标

- 不改变常规面试训练会话的题目推进方式。
- 不改变模型评估的四项评分结构。
- 不增加新的 tabBar 项。
- 不覆盖原始面试轮次或原始评估。

## 信息架构

新增非 tabBar 页面 `pages/review/review`：

- 面试页头部提供“复习”入口。
- 首页“待复习”区点击任意条目或“查看全部”进入复习工作区。
- 复习列表点击条目进入 `pages/review-detail/review-detail?id=<reviewItemId>`。

复习页包含两个状态标签：

- 待复习：默认标签，展示 `PENDING` 项数量和分页队列。
- 已复习：展示 `COMPLETED` 项，供回看和再次练习。

列表项显示：

- 复习标题
- 最近一次待加强原因摘要
- 来源面试模式
- 创建或完成时间
- 当前状态

页面通过 `onReachBottom` 加载下一页。首次加载、加载更多、无数据、没有更多数据和失败重试都必须有明确状态。

## 详情与操作

详情页按时间展示：

1. 来源面试模式和当前复习状态。
2. 复习标题和原始待加强原因。
3. 原始题目、原始回答和原始评分摘要。
4. 历史复习尝试，包含新回答、评分、结论和时间。
5. 当前重新回答输入框。

重新作答操作区使用紧凑右对齐样式：

- 主操作“重新评估”：高度约 36px，正文级字号，绿色实心。
- 次操作“保留待复习”：高度约 36px，较小字号，低强调描边。
- “手动标记已复习”作为详情中的低强调操作，不与重新评估并列争夺视觉焦点。

## 状态规则

### 自动归档

重新评估请求成功且四项平均分满足以下条件时：

```text
(accuracy + depth + structure + clarity) / 4 >= 60
```

系统自动将 ReviewItem 置为 `COMPLETED`，记录完成时间，并在详情中显示“本次复习已完成”。

若平均分低于 60：

- ReviewItem 状态置为或保持 `PENDING`。
- 保存本次复习尝试。
- 显示最新评分和反馈。
- 清空输入框，仅在成功保存后清空。

已复习项再次作答且平均分低于 60 时，恢复为 `PENDING`。

### 手动操作

- “保留待复习”不提交模型评估，不改变状态。
- “手动标记已复习”将当前项标记为 `COMPLETED`，记录完成时间。
- 已复习详情提供“恢复待复习”操作，恢复为 `PENDING`。

## 数据模型

### ReviewItem 扩展

保留现有字段：

- `id`
- `ownerId`
- `sourceTurnId`
- `title`
- `reason`
- `status`
- `dueAt`
- `createdAt`
- `updatedAt`

新增：

- `completedAt: timestamp | null`
- `lastReviewedAt: timestamp | null`

### ReviewAttempt 新实体

新增 `kh_review_attempt`，每一次重新作答都创建独立记录：

- `id`
- `reviewItemId`
- `ownerId`
- `answer`
- `evaluation`：复用 InterviewEvaluation JSON
- `citationIds`
- `score`：四项平均分
- `createdAt`

原始面试题目、回答与评估从 `ReviewItem.sourceTurnId` 查询，不复制到复习项中。

## 后端接口

### 分页列表

```http
GET /interview/review-items?status=PENDING&page=1&pageSize=20
```

响应：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

只允许 `PENDING` 或 `COMPLETED`。默认 `PENDING`，默认页码 1，默认页大小 20，最大页大小 50。

### 详情

```http
GET /interview/review-items/:id
```

返回 ReviewItem、来源 InterviewTurn、来源 InterviewSession 的 mode，以及按创建时间升序的 ReviewAttempt 列表。

### 重新评估

```http
POST /interview/review-items/:id/answers
Content-Type: application/json

{
  "answer": "..."
}
```

服务端：

1. 校验复习项归属。
2. 加载来源 turn 与 session，取得原题和 datasetId。
3. 调用现有 `InterviewAgentService.evaluate`。
4. 计算平均分，保存 ReviewAttempt。
5. 更新 ReviewItem 的 `status`、`lastReviewedAt` 和 `completedAt`。
6. 返回 attempt、item、自动完成标记和平均分。

评估请求沿用 120 秒客户端超时。

### 手动状态更新

```http
PATCH /interview/review-items/:id
Content-Type: application/json

{
  "status": "COMPLETED"
}
```

`COMPLETED` 写入 completedAt；`PENDING` 清空 completedAt。两种操作都更新 lastReviewedAt。

## 小程序状态

复习页：

- `activeStatus`
- `items`
- `page`
- `total`
- `hasMore`
- `loading`
- `loadingMore`
- `error`

详情页：

- `review`
- `answer`
- `submitting`
- `statusUpdating`
- `lastAttempt`
- `error`

所有异步操作必须防止重复请求。加载更多失败保留已有列表，允许再次触底重试。重新评估失败保留用户输入和当前复习状态。

## 测试策略

### API

- 分页查询按用户和状态过滤，且返回正确总数。
- 复习详情拒绝非所有者访问。
- 重答使用来源题目和资料集进行评估。
- 平均分达到 60 自动完成，低于 60 保持或恢复待复习。
- 重答生成独立 ReviewAttempt，不覆盖来源 InterviewTurn。
- 手动完成与恢复待复习正确更新时间字段。

### 小程序

- 两种状态分页追加并正确终止加载更多。
- 详情页显示来源 turn、历史尝试和最新评分。
- 重新评估调用 120 秒超时接口。
- 低分结果保留待复习，高分结果自动归档。
- 失败时保留答案输入和当前列表。

### 手工验收

1. 从面试页进入复习，确认待复习列表可连续加载。
2. 切换已复习，确认不会混入待复习项。
3. 打开详情，确认原题、原回答、原反馈可见。
4. 重新回答并得到平均分 60 或以上，确认自动归档。
5. 重新回答并得到低于 60 的分数，确认保持待复习。
6. 手动完成后确认条目进入已复习；恢复待复习后回到待复习列表。
7. 模拟评估请求超时，确认输入答案仍保留。
