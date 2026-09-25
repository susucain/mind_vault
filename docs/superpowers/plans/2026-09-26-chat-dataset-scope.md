# 问答资料范围选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让问答会话支持可搜索的多选资料范围、“全部资料”快捷项，并将切换结果持久化到当前会话，使下一次提问使用新范围。

**Architecture:** 后端新增会话资料范围更新接口，服务端校验会话和资料集归属后保存去重后的 ID；问答页用 `draftDatasetIds` 编辑临时选择，点击完成后一次性提交。前端将“全部资料”表示为当前资料集 ID 的完整集合，避免依赖空数组的隐式检索语义。

**Tech Stack:** NestJS、TypeORM、class-validator、微信小程序 TypeScript/WXML/WXSS、Vant Weapp、Jest、TypeScript compiler。

---

## 文件结构

- Modify: `mind_vault_api/src/chat/dto/create-conversation.dto.ts`
  - 抽取可复用的资料集 ID 数组校验规则，新增更新 DTO。
- Create: `mind_vault_api/src/chat/dto/update-conversation.dto.ts`
  - 定义 `PATCH /conversations/:id` 的非空 `datasetIds` 请求体。
- Modify: `mind_vault_api/src/chat/chat.controller.ts`
  - 增加会话资料范围更新路由。
- Modify: `mind_vault_api/src/chat/chat.service.ts`
  - 增加归属校验、去重和保存方法。
- Modify: `mind_vault_api/src/chat/chat.module.ts`
  - 注入资料集 repository，供会话更新校验使用。
- Modify: `mind_vault_api/src/chat/chat.service.spec.ts`
  - 覆盖更新和下一次 ask 使用新范围。
- Modify: `mind_vault_miniapp/services/chat.ts`
  - 增加更新会话资料范围的请求函数。
- Create: `mind_vault_miniapp/utils/chat-dataset-scope.ts`
  - 封装全选判定、切换单项、范围摘要和旧空数组兼容。
- Create: `mind_vault_miniapp/utils/chat-dataset-scope.test.ts`
  - 测试资料范围纯函数。
- Modify: `mind_vault_miniapp/pages/chat/chat.ts`
  - 管理搜索、草稿选择、保存、会话同步和失败恢复。
- Modify: `mind_vault_miniapp/pages/chat/chat.wxml`
  - 将横向资料 chip 替换为当前范围摘要、切换按钮和多选面板。
- Modify: `mind_vault_miniapp/pages/chat/chat.wxss`
  - 增加方案 B 的范围摘要、选择面板、搜索结果和选中态样式。
- Modify: `mind_vault_miniapp/pages/chat/chat.json`
  - 如页面使用 Vant Popup/Checkbox，补充对应组件声明。

当前工作区已有的 `mind_vault_miniapp/pages/library/*` 和 `.gitignore` 修改不属于本计划，不得覆盖或回滚。

### Task 1: 后端更新会话资料范围

**Files:**
- Create: `mind_vault_api/src/chat/dto/update-conversation.dto.ts`
- Modify: `mind_vault_api/src/chat/dto/create-conversation.dto.ts`
- Modify: `mind_vault_api/src/chat/chat.controller.ts`
- Modify: `mind_vault_api/src/chat/chat.service.ts`
- Modify: `mind_vault_api/src/chat/chat.module.ts`
- Test: `mind_vault_api/src/chat/chat.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

在 `chat.service.spec.ts` 的现有 `buildService` 测试夹具中增加 Dataset repository mock，并新增以下行为测试：

```ts
it('updates a conversation dataset scope after validating ownership', async () => {
  const { service, conversation, datasets, conversations } = buildService({
    datasetIds: ['dataset_1'],
  });
  datasets.find.mockResolvedValue([
    { id: 'dataset_1', ownerId: 'user_1', deleted: false },
    { id: 'dataset_2', ownerId: 'user_1', deleted: false },
  ]);

  const result = await service.updateDatasetScope('user_1', 'conversation_1', [
    'dataset_2',
    'dataset_2',
    'dataset_1',
  ]);

  expect(conversation.datasetIds).toEqual(['dataset_2', 'dataset_1']);
  expect(conversations.save).toHaveBeenCalledWith(conversation);
  expect(result).toBe(conversation);
});

it('passes the updated dataset scope to the next ask', async () => {
  const { service, conversation, datasets, agent } = buildService({
    datasetIds: ['dataset_2'],
  });
  datasets.find.mockResolvedValue([
    { id: 'dataset_1', ownerId: 'user_1', deleted: false },
  ]);
  conversation.datasetIds = ['dataset_1'];

  await service.ask('user_1', 'conversation_1', '下一问');

  expect(agent.invoke).toHaveBeenCalledWith(
    expect.objectContaining({ datasetIds: ['dataset_1'] }),
  );
});
```

增加失败用例：空数组、超过 20 个 ID、资料集不存在或属于其他用户时抛出 `BadRequestException`，会话不存在继续抛出 `NotFoundException`。

- [ ] **Step 2: Run the focused API tests and verify RED**

Run:

```bash
cd mind_vault_api
pnpm test -- --runInBand src/chat/chat.service.spec.ts
```

Expected: FAIL，因为 `updateDatasetScope` 方法和 Dataset repository 注入尚不存在；失败应发生在业务能力缺失处，而不是测试语法错误。

- [ ] **Step 3: Add the update DTO and repository dependency**

创建 `update-conversation.dto.ts`：

```ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  datasetIds: string[];
}
```

在 `ChatService` 注入 `Repository<DatasetEntity>`，在 `ChatModule` 的 `TypeOrmModule.forFeature` 中注册 `DatasetEntity`。使用现有 `DatasetEntity` 的 `ownerId`、`deleted` 字段做归属查询。

- [ ] **Step 4: Implement validation, deduplication and persistence**

在 `ChatService` 增加：

```ts
async updateDatasetScope(
  ownerId: string,
  conversationId: string,
  datasetIds: string[],
) {
  const conversation = await this.findConversation(ownerId, conversationId);
  const uniqueIds = [...new Set(datasetIds)];
  const datasets = await this.datasets.find({
    where: uniqueIds.map((id) => ({ id, ownerId, deleted: false })),
  });
  if (datasets.length !== uniqueIds.length) {
    throw new BadRequestException('资料集不存在或无权访问');
  }
  conversation.datasetIds = uniqueIds;
  return this.conversations.save(conversation);
}
```

保留 `ask` 现有逻辑，使它从刚读取的 conversation 对象取 `conversation.datasetIds` 传给 agent。错误类型和导入按项目现有 NestJS 风格补齐。

- [ ] **Step 5: Add the controller route**

在 `chat.controller.ts` 添加：

```ts
@Patch(':id')
update(
  @CurrentUser() user: { id: string },
  @Param('id') id: string,
  @Body() dto: UpdateConversationDto,
) {
  return this.chat.updateDatasetScope(user.id, id, dto.datasetIds);
}
```

同时导入 `Patch` 和 `UpdateConversationDto`。路由必须位于 `@Get(':id/messages')` 之前或之后均可，但不能改变现有参数路由行为。

- [ ] **Step 6: Run the focused API tests and verify GREEN**

Run:

```bash
cd mind_vault_api
pnpm test -- --runInBand src/chat/chat.service.spec.ts
pnpm run build
```

Expected: chat service tests PASS，Nest build PASS。

- [ ] **Step 7: Commit the backend slice**

```bash
git add mind_vault_api/src/chat
git commit -m "feat(api): 支持更新问答会话资料范围"
```

### Task 2: 前端资料范围纯函数和服务接口

**Files:**
- Modify: `mind_vault_miniapp/services/chat.ts`
- Create: `mind_vault_miniapp/utils/chat-dataset-scope.ts`
- Create: `mind_vault_miniapp/utils/chat-dataset-scope.test.ts`

- [ ] **Step 1: Write failing pure-function tests**

测试以下行为：

```ts
it('recognizes all datasets as the all-sources shortcut', () => {
  expect(isAllDatasetScope(['a', 'b'], ['b', 'a'])).toBe(true);
  expect(isAllDatasetScope(['a'], ['a', 'b'])).toBe(false);
});

it('toggles all sources and individual datasets', () => {
  expect(toggleAllDatasetScope(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  expect(toggleDatasetScope(['a', 'b'], 'a')).toEqual(['b']);
  expect(toggleDatasetScope(['b'], 'a')).toEqual(['b', 'a']);
});

it('normalizes an old empty scope as all sources', () => {
  expect(normalizeDatasetScope([], ['a', 'b'])).toEqual(['a', 'b']);
});
```

增加摘要测试：空资料集返回 `还没有资料`，全选返回 `全部资料`，单选返回名称，多选返回 `已选 N 个资料集`。

- [ ] **Step 2: Run the focused miniapp test and verify RED**

Run:

```bash
cd mind_vault_miniapp
pnpm exec tsx utils/chat-dataset-scope.test.ts
```

Expected: FAIL，因为工具函数文件尚不存在。

- [ ] **Step 3: Implement pure functions**

在 `chat-dataset-scope.ts` 导出：

- `normalizeDatasetScope(selectedIds, allIds): string[]`
- `isAllDatasetScope(selectedIds, allIds): boolean`
- `toggleAllDatasetScope(selectedIds, allIds): string[]`
- `toggleDatasetScope(selectedIds, id): string[]`
- `datasetScopeSummary(selectedIds, datasets): string`

所有函数都返回新数组，不修改传入数组；判定全选时按集合比较而非顺序比较；去除不存在于 `allIds` 的旧 ID。

- [ ] **Step 4: Add the API client method**

在 `services/chat.ts` 增加：

```ts
export function updateConversationDatasetScope(
  conversationId: string,
  datasetIds: string[],
) {
  return request<Conversation, { datasetIds: string[] }>({
    path: `/conversations/${conversationId}`,
    method: 'PATCH',
    data: { datasetIds },
  });
}
```

- [ ] **Step 5: Run pure-function tests and typecheck**

Run:

```bash
cd mind_vault_miniapp
pnpm exec tsx utils/chat-dataset-scope.test.ts
pnpm run typecheck
```

Expected: tests PASS，typecheck PASS。

- [ ] **Step 6: Commit the utility slice**

```bash
git add mind_vault_miniapp/services/chat.ts mind_vault_miniapp/utils/chat-dataset-scope.ts mind_vault_miniapp/utils/chat-dataset-scope.test.ts
git commit -m "feat(miniapp): 添加问答资料范围状态工具"
```

### Task 3: 问答页方案 B 多选选择器

**Files:**
- Modify: `mind_vault_miniapp/pages/chat/chat.ts`
- Modify: `mind_vault_miniapp/pages/chat/chat.wxml`
- Modify: `mind_vault_miniapp/pages/chat/chat.wxss`
- Modify: `mind_vault_miniapp/pages/chat/chat.json`

- [ ] **Step 1: Add the page state and imports**

在 `chat.ts` 引入 Task 2 的纯函数和 `updateConversationDatasetScope`，并增加：

```ts
draftDatasetIds: [] as string[],
showDatasetSelector: false,
datasetQuery: '',
datasetResults: [] as Dataset[],
searchingDatasets: false,
savingDatasetScope: false,
datasetScopeError: '',
datasetScopeLabel: '全部资料',
isAllScope: false,
```

初始化资料集后将新会话的范围设为 `datasets.map(({ id }) => id)`；打开已有会话时将 `conversation.datasetIds` 通过 `normalizeDatasetScope` 处理，不能再无条件覆盖成全部 ID。

- [ ] **Step 2: Add failing page behavior coverage at the utility boundary**

先扩充 `chat-dataset-scope.test.ts`，覆盖页面将使用的状态转换：

```ts
it('keeps selected datasets outside a search result', () => {
  const selected = toggleDatasetScope(['backend', 'system'], 'backend');
  expect(selected).toEqual(['system']);
  expect(isAllDatasetScope(selected, ['backend', 'system', 'java'])).toBe(false);
});
```

Run the focused test and verify it fails before adding the corresponding utility behavior, then implement the minimal helper adjustment and rerun.

- [ ] **Step 3: Implement panel lifecycle and search**

在页面对象增加：

- `openDatasetSelector`: 初始化 `draftDatasetIds`、清空 query、显示前 6 个资料集。
- `closeDatasetSelector`: 关闭并清空草稿、搜索结果和错误。
- `updateDatasetQuery`: 复用 Library 页 200-300ms 防抖，调用 `listDatasets({ name, pageSize: 20 })`；请求返回只更新 `datasetResults`，不覆盖草稿。
- `toggleAllDatasets`: 使用 `toggleAllDatasetScope` 更新草稿。
- `toggleDraftDataset`: 使用 `toggleDatasetScope` 更新草稿。

搜索定时器必须在 `onUnload` 清理，和 Library 页现有资源清理模式一致。

- [ ] **Step 4: Implement save and failure recovery**

增加 `saveDatasetScope`：

```ts
async saveDatasetScope() {
  const datasetIds = normalizeDatasetScope(
    this.data.draftDatasetIds,
    this.data.datasets.map((dataset) => dataset.id),
  );
  if (!datasetIds.length) {
    wx.showToast({ title: '请至少选择一个资料集', icon: 'none' });
    return;
  }
  this.setData({ savingDatasetScope: true, datasetScopeError: '' });
  try {
    const conversation = await updateConversationDatasetScope(
      this.data.conversationId,
      datasetIds,
    );
    this.setData({
      selectedDatasetIds: conversation.datasetIds,
      conversations: this.data.conversations.map((item) =>
        item.id === conversation.id ? conversation : item,
      ),
      showDatasetSelector: false,
      draftDatasetIds: [],
    });
  } catch (error) {
    this.setData({
      datasetScopeError:
        error instanceof Error ? error.message : '保存资料范围失败',
    });
    showRequestError(error);
  } finally {
    this.setData({ savingDatasetScope: false });
  }
}
```

发送逻辑增加 `savingDatasetScope` 保护；发送进行中禁止打开面板；会话切换时关闭面板并清理草稿。

- [ ] **Step 5: Replace the WXML dataset chips**

删除原有 `dataset-scroll` 和 `toggleDataset` 绑定，改为：

```xml
<view class="dataset-scope">
  <view class="dataset-scope-summary">
    <text>{{datasetScopeLabel}}</text>
    <van-button size="small" plain bind:click="openDatasetSelector">切换</van-button>
  </view>
</view>
<van-popup
  show="{{showDatasetSelector}}"
  position="bottom"
  round
  bind:close="closeDatasetSelector"
>
  <view class="dataset-selector-panel">
    <view class="dataset-selector-head">
      <text>选择资料范围</text>
      <text bind:tap="closeDatasetSelector">取消</text>
    </view>
    <van-field value="{{datasetQuery}}" placeholder="搜索资料集" bind:change="updateDatasetQuery" />
    <view class="dataset-scope-option {{isAllScope ? 'dataset-scope-option-active' : ''}}" bind:tap="toggleAllDatasets">
      <text>全部资料</text>
      <text>{{isAllScope ? '已选' : '快捷全选'}}</text>
    </view>
    <text wx:if="{{searchingDatasets}}" class="dataset-feedback">正在搜索</text>
    <text wx:elif="{{!datasetResults.length}}" class="dataset-feedback">没有匹配的资料集</text>
    <view wx:for="{{datasetResults}}" wx:key="id" class="dataset-scope-option {{draftDatasetIds.includes(item.id) ? 'dataset-scope-option-active' : ''}}" data-id="{{item.id}}" bind:tap="toggleDraftDataset">
      <text>{{item.name}}</text>
      <text>{{draftDatasetIds.includes(item.id) ? '已选' : '选择'}}</text>
    </view>
    <text wx:if="{{datasetScopeError}}" class="dataset-scope-error">{{datasetScopeError}}</text>
    <van-button type="primary" block loading="{{savingDatasetScope}}" disabled="{{savingDatasetScope}}" bind:click="saveDatasetScope">完成</van-button>
  </view>
</van-popup>
```

将 `datasetScopeLabel` 和 `isAllScope` 作为页面 data 字段，每次 `setData` 更新 `selectedDatasetIds` 或 `draftDatasetIds` 时用纯函数重新计算，避免在 WXML 中依赖复杂表达式。保存成功后使用已保存的 `selectedDatasetIds` 计算摘要；打开面板时使用草稿集合计算 `isAllScope`。

- [ ] **Step 6: Add styles and component declaration**

在 `chat.wxss` 增加稳定的摘要行、底部面板、搜索结果、全选/单项选中态和错误文本样式；沿用 Library 页的颜色、间距和 6rpx 边角，不再依赖横向滚动布局。

在 `chat.json` 声明 `van-popup`（若当前页面尚未声明）并保留已有 `van-button`、`van-field`、`van-icon`、`mp-html` 声明。

- [ ] **Step 7: Run miniapp typecheck and focused tests**

Run:

```bash
cd mind_vault_miniapp
pnpm run typecheck
pnpm exec tsx utils/chat-dataset-scope.test.ts
pnpm run format:check
```

Expected: all PASS，且不修改 Library 页现有未提交内容。

- [ ] **Step 8: Commit the chat UI slice**

```bash
git add mind_vault_miniapp/pages/chat mind_vault_miniapp/utils/chat-dataset-scope.ts mind_vault_miniapp/utils/chat-dataset-scope.test.ts mind_vault_miniapp/services/chat.ts
git commit -m "feat(miniapp): 支持问答会话多选资料范围"
```

### Task 4: 集成回归和接口契约检查

**Files:**
- Modify only when a test exposes a real defect: `mind_vault_api/src/chat/*.spec.ts`, `mind_vault_miniapp/utils/*.test.ts`

- [ ] **Step 1: Run all backend tests**

```bash
cd mind_vault_api
pnpm test -- --runInBand
```

Expected: all existing and new API tests PASS。

- [ ] **Step 2: Run all miniapp checks**

```bash
cd mind_vault_miniapp
pnpm run typecheck
pnpm run format:check
pnpm exec tsx utils/chat-dataset-scope.test.ts
pnpm exec tsx utils/sse.test.ts
pnpm exec tsx utils/sessions.test.ts
```

Expected: all commands PASS。

- [ ] **Step 3: Inspect the final diff for unrelated changes**

```bash
git diff HEAD~2 --stat
git status --short
git diff --check HEAD~2
```

Confirm that the diff contains only the API endpoint, chat page/utility changes, tests, and the plan/spec commits; preserve the pre-existing Library page and `.gitignore` modifications.

- [ ] **Step 4: Perform manual acceptance**

Use the available WeChat developer tooling or connected miniapp environment:

1. Open a new chat and confirm `全部资料` is shown and all dataset options are selected.
2. Open `切换`, search by dataset name, select two datasets, press `完成`, then send a new question.
3. Confirm the conversation API stores the two IDs and the next `ask` passes only those IDs to the agent.
4. Remove one dataset, reopen the same conversation, and confirm the saved selection remains.
5. Choose `全部资料` and confirm all current datasets are selected.
6. Force the PATCH request to fail and confirm the popup remains open with the draft selection intact.

- [ ] **Step 5: Commit only regression fixes**

```bash
git add <files containing verified fixes>
git commit -m "fix: 完善问答资料范围选择回归"
```

Only create this commit if Task 4 finds and fixes a real defect; do not commit formatting churn or unrelated Library changes.
