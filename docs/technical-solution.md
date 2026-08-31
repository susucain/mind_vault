# Mind Vault MVP 技术方案

> 覆盖范围：产品需求文档中的 P0
> 后端：NestJS + TypeScript
> Agent：LangGraph.js
> 客户端：微信小程序
> 方案版本：V0.1

## 1. 技术目标与边界

本方案交付一个可运行的个人知识库 MVP，支持：

- 微信用户登录和用户数据隔离
- 10 类文件上传、解析、异步建立索引
- ES 关键词检索
- Elasticsearch `dense_vector` 向量检索
- Neo4j 实体关系检索
- LangGraph Agent 动态选择检索工具
- 基于证据的问答、引用和原文定位
- 面试资料集、模拟面试、追问和训练反馈
- 文档删除后的全链路清理

本阶段不实现健康、英语、任务管理、OCR 漫画和多人协作。扫描版 PDF 可以先识别为“解析成功但文本为空”，OCR 作为 P1。

## 2. 总体架构

```mermaid
flowchart TB
  MP[微信小程序] --> API[NestJS API]
  API --> AUTH[AuthModule]
  API --> DOC[DocumentModule]
  API --> CHAT[ChatModule]
  API --> INT[InterviewModule]
  API --> DATA[(PostgreSQL)]
  API --> CONTENT[(MongoDB)]
  API --> OBJ[(RustFS / S3)]
  API --> GRAPH[LangGraph Runtime]
  GRAPH --> LLM[LLM Provider]
  GRAPH --> ES[Elasticsearch]
  GRAPH --> NEO[Neo4j]
  GRAPH --> EMB[Embedding Provider]
  DOC --> MQ[RabbitMQ]
  MQ --> WORKER[Pipeline Worker]
  WORKER --> CONTENT
  WORKER --> ES
  WORKER --> NEO
  WORKER --> EMB
  WORKER --> OBJ
```

### 2.1 进程划分

MVP 使用同一套 NestJS 代码，提供两个启动模式：

1. `api`：HTTP API、鉴权、文件上传、流式问答、查询任务状态
2. `worker`：RabbitMQ 消费者，执行解析、切分、Embedding、索引和图谱抽取

不建议在 HTTP 请求中同步解析文件或同步构建三套索引。

### 2.2 数据职责

| 组件 | 数据 |
|---|---|
| PostgreSQL | 用户、文档元数据、资料集、标签、任务、会话、面试、引用 |
| MongoDB | 解析后的结构化正文、章节和定位信息 |
| RustFS | 原文件、PDF 页面预览、后续 OCR 图片 |
| Elasticsearch | BM25 字段、向量字段、文档元数据过滤 |
| Neo4j | 实体、关系、来源 chunk 和文档范围 |
| RabbitMQ | 文档索引任务、删除任务、重建任务 |

当前仓库的 `DocumentEntity` 和 `DocumentContent` 可以继续使用，但需要补充用户、资料集、索引任务等模型，并删除或隔离原有面向团队/审核的字段逻辑。个人知识库 MVP 默认不启用内容审核。

## 3. NestJS 模块设计

建议目录：

```text
src/
  app.module.ts
  main.ts
  config/
  auth/
  user/
  document/
    parser/
    chunking/
    preview/
  dataset/
  ingestion/
  retrieval/
    es/
    vector/
    neo4j/
    fusion/
  chat/
  interview/
  citation/
  storage/
  mq/
  common/
    guards/
    filters/
    interceptors/
    dto/
    types/
worker.ts
```

模块职责：

- `AuthModule`：微信 `code` 换取 session、JWT 签发和鉴权 Guard
- `DocumentModule`：文件上传、文档元数据、预览和删除
- `DatasetModule`：资料集、标签、文档关联
- `IngestionModule`：任务创建、状态机、解析和索引编排
- `RetrievalModule`：三路检索、过滤、融合和重排
- `ChatModule`：会话、LangGraph 调用、流式响应、引用反馈
- `InterviewModule`：面试配置、出题、回答、反馈和复习项
- `StorageModule`：RustFS S3 上传、签名 URL、删除
- `MqModule`：RabbitMQ 发布和消费

NestJS 只负责系统边界和依赖注入。LangGraph 的 StateGraph、节点和工具代码放在 `chat/graph`，不要把 Agent 逻辑写进 Controller。

## 4. 用户认证与数据隔离

### 4.1 登录流程

```text
小程序 wx.login()
  -> POST /v1/auth/wechat
  -> 服务端调用微信 auth.code2Session
  -> upsert user(openid)
  -> 签发 access_token
  -> 小程序后续请求携带 Authorization: Bearer <token>
```

生产环境不保存 `session_key` 明文。建议保存加密值或仅在需要解密手机号时短时使用。

### 4.2 鉴权规则

- 全部业务表包含 `owner_id`
- Controller 使用 `CurrentUser` 装饰器获得用户 ID
- Service 层每一次查询都强制追加 `owner_id`
- ES 查询必须包含 `term ownerId`
- Neo4j 节点和关系必须包含 `ownerId`
- RustFS 对象 Key 使用 `users/{ownerId}/documents/{documentId}/...`
- 禁止使用客户端传入的 `ownerId`

## 5. 文档导入与解析管线

### 5.1 P0 文件格式

| 格式 | 解析实现建议 | 定位粒度 |
|---|---|---|
| PDF | `pdfjs-dist` 或现有 PDF parser | 页码、段落 |
| DOCX | `mammoth` / 现有 parser | 章节、段落 |
| DOC | LibreOffice headless 转 DOCX 后解析 | 转换后页/段落 |
| XLSX | `exceljs` / 现有 parser | 工作表、单元格范围 |
| XLS | LibreOffice 转 XLSX 后解析 | 工作表、单元格范围 |
| PPTX | `pptxgenjs` 仅用于生成，不适合解析；使用 `pptx2json` 或 LibreOffice 转换 | 幻灯片 |
| PPT | LibreOffice headless 转 PPTX | 幻灯片 |
| TXT / MD | 原始文本解析 | 行号、章节 |
| CSV | `csv-parse` | 行号、列名 |
| JSON | 原生 JSON parse + 结构化格式化 | JSONPath |

建议保留当前 `FileParserService` 作为统一入口，但把返回值从 `string` 升级为 `ParsedDocument`，同时保留兼容的 Markdown 输出。

```ts
interface ParsedDocument {
  title: string;
  format: string;
  pageCount?: number;
  sections: ParsedSection[];
  assets: ParsedAsset[];
}

interface ParsedSection {
  sectionId: string;
  heading?: string;
  text: string;
  order: number;
  locator: {
    page?: number;
    slide?: number;
    sheet?: string;
    cellRange?: string;
    lineStart?: number;
    lineEnd?: number;
    jsonPath?: string;
  };
}
```

### 5.2 任务状态

```text
UPLOADED
  -> PARSING
  -> PARSED
  -> CHUNKING
  -> EMBEDDING
  -> INDEXING
  -> READY
```

失败状态为 `FAILED`，并记录 `failed_stage`、`error_code`、`error_message` 和 `retry_count`。单个阶段幂等，重试不能产生重复 chunk、重复关系或脏索引。

### 5.3 RabbitMQ 消息

Exchange：`mind-vault.ingestion`
Queue：`mind-vault.ingestion.worker`
Routing key：

- `document.index`
- `document.reindex`
- `document.delete`

消息体：

```json
{
  "jobId": "job_123",
  "ownerId": "user_123",
  "documentId": "doc_123",
  "documentVersion": 1,
  "operation": "index"
}
```

消息必须带文档版本。Worker 处理前再次检查版本，过期消息直接标记为 skipped。

## 6. 内容切分与定位

### 6.1 切分规则

优先使用结构边界，再使用长度边界：

1. 按章节、标题、页面和幻灯片分组
2. 表格保持表头与行的关联
3. 长段落按约 500～800 tokens 切分
4. 相邻 chunk 保留约 80～120 tokens overlap
5. 代码块、JSON 对象和列表尽量不在中间截断

每个 chunk 生成稳定 ID：

```text
sha256(ownerId + documentId + version + sectionId + order)
```

### 6.2 Chunk 元数据

```json
{
  "chunkId": "chunk_hash",
  "ownerId": "user_123",
  "documentId": "doc_123",
  "version": 1,
  "sectionId": "s_003",
  "chunkOrder": 4,
  "text": "...",
  "titlePath": ["系统设计", "异步化改造"],
  "locator": {
    "page": 42,
    "charStart": 1200,
    "charEnd": 1800
  }
}
```

原文定位信息必须在解析和切分时保存，不能依赖模型生成页码。

## 7. Elasticsearch 设计

### 7.1 索引

每个环境一个索引，建议使用版本别名：

```text
mind_vault_chunks_v1
mind_vault_chunks_write
mind_vault_chunks_read
```

### 7.2 Mapping 核心字段

```json
{
  "mappings": {
    "properties": {
      "chunkId": { "type": "keyword" },
      "ownerId": { "type": "keyword" },
      "documentId": { "type": "keyword" },
      "datasetIds": { "type": "keyword" },
      "documentVersion": { "type": "integer" },
      "title": { "type": "text", "analyzer": "ik_max_word" },
      "titleKeyword": { "type": "keyword" },
      "text": { "type": "text", "analyzer": "ik_max_word" },
      "textKeyword": { "type": "keyword", "index": false },
      "embedding": {
        "type": "dense_vector",
        "dims": 1536,
        "index": true,
        "similarity": "cosine"
      },
      "locator": { "type": "object", "enabled": true },
      "entities": { "type": "keyword" },
      "updatedAt": { "type": "date" }
    }
  }
}
```

`dims` 必须与实际 Embedding 模型一致，通过环境变量配置，不能在运行时混用不同维度。

### 7.3 三路中的 ES 两路

- 关键词：`multi_match` 搜索 `title^3`、`text`、`entities^2`，配合 owner/dataset 过滤
- 向量：`knn` 查询 `embedding`，配合同样的过滤条件

两路都返回统一的 `RetrievalHit`：

```ts
interface RetrievalHit {
  chunkId: string;
  documentId: string;
  source: 'keyword' | 'vector' | 'graph';
  score: number;
  text: string;
  locator: Locator;
  metadata: SourceMetadata;
}
```

## 8. Neo4j 知识图谱

### 8.1 节点和关系

节点：

```text
(:Entity {
  id, ownerId, name, normalizedName, type
})
(:Document {
  id, ownerId, title
})
(:Chunk {
  id, ownerId, documentId, version
})
```

关系：

```text
(Entity)-[:RELATED_TO {type, confidence, ownerId, sourceChunkId}]->(Entity)
(Entity)-[:MENTIONED_IN {ownerId}]->(Chunk)
(Chunk)-[:PART_OF {ownerId}]->(Document)
```

MVP 实体类型限制为：`PERSON`、`PROJECT`、`TECHNOLOGY`、`CONCEPT`、`ORGANIZATION`、`EVENT`。关系类型先使用受控枚举，避免图谱被 LLM 生成大量近义关系污染。

### 8.2 抽取流程

1. 对每个 chunk 做实体和关系抽取
2. 使用 `normalizedName` 去重
3. 写入实体、关系和来源 chunk
4. 保留 `confidence` 和原文 `sourceChunkId`
5. 低于阈值的关系只保存为候选，不参与默认回答

### 8.3 图谱查询

问题含有人名、项目名或关系词时，先做实体链接，再执行最多 2～3 跳的 Cypher 查询。禁止让模型直接生成任意 Cypher；工具内部只接受结构化参数：

```ts
graphSearch({
  ownerId,
  entityNames,
  relationTypes,
  maxHops: 2,
  datasetIds
})
```

## 9. LangGraph Agentic RAG

### 9.1 State

```ts
interface RagState {
  ownerId: string;
  conversationId: string;
  question: string;
  datasetIds: string[];
  intent: 'lookup' | 'semantic' | 'graph' | 'compare' | 'interview';
  complexity: 'low' | 'medium' | 'high';
  plan: RetrievalPlan;
  hits: RetrievalHit[];
  evidence: EvidencePack;
  answer?: string;
  citations: CitationDraft[];
  confidence: number;
  needClarification: boolean;
  error?: string;
}
```

### 9.2 Graph 节点

```mermaid
flowchart LR
  A[入参校验] --> B[意图与复杂度分类]
  B --> C{路由}
  C -->|精确问题| D[ES 关键词]
  C -->|语义问题| E[向量检索]
  C -->|关系问题| F[Neo4j 图谱]
  C -->|复杂/跨文档| G[三路并行]
  D --> H[融合与重排]
  E --> H
  F --> H
  G --> H
  H --> I{证据充分?}
  I -->|否| J[改写查询/扩大召回]
  J --> C
  I -->|是| K[生成带引用回答]
  K --> L[引用校验]
  L --> M[保存会话/流式返回]
```

### 9.3 路由策略

分类节点输出结构化 JSON，并使用 Zod 校验：

```ts
interface RetrievalPlan {
  tools: Array<'keyword' | 'vector' | 'graph'>;
  queryRewrites: string[];
  topK: number;
  requireQuotes: boolean;
  maxHops?: number;
}
```

基础规则：

- `lookup`：keyword，必要时追加 vector
- `semantic`：vector
- `graph`：graph + vector
- `compare`：keyword + vector + graph
- `interview`：资料检索 + 面试生成节点

LLM 只决定意图、复杂度和参数；工具执行、用户过滤、最大步数和超时由服务端强制限制。

### 9.4 证据门禁

生成节点只接收 `EvidencePack`，不直接读取整个文档。门禁规则：

- 至少一个命中 chunk，或明确返回“资料中没有足够证据”
- 每个事实性段落绑定 citation ID
- 引用的 `chunkId` 必须存在于本次检索结果
- 不允许模型自行修改页码、章节或文件名
- 置信度低于阈值时使用不确定性措辞并建议用户缩小范围

回答协议：

```json
{
  "answer": "回答正文",
  "citations": [
    {
      "citationId": "c1",
      "documentId": "doc_123",
      "chunkId": "chunk_hash",
      "quote": "原文片段",
      "locator": { "page": 42 }
    }
  ],
  "confidence": 0.86,
  "usedTools": ["keyword", "vector"]
}
```

## 10. 面试 Agent

面试场景复用同一套检索工具，但使用独立的 LangGraph 子图：

```text
加载资料集
  -> 生成题目
  -> 等待用户回答
  -> 检索相关项目证据
  -> 评价回答
  -> 决定追问 / 下一题 / 结束
  -> 生成反馈和 ReviewItem
```

状态至少保存：

- `sessionId`
- `questionId`
- 用户回答
- 使用的资料集
- 相关引用
- 评价 JSON
- 当前题目序号
- token 和耗时

评价 JSON：

```json
{
  "accuracy": 0,
  "depth": 0,
  "structure": 0,
  "clarity": 0,
  "strengths": [],
  "gaps": [],
  "followUp": "下一道追问",
  "reviewItems": []
}
```

分数只作为训练反馈，不作为事实判断。面试 Agent 不应凭空补充用户未提供的项目经历。

## 11. API 设计

统一前缀：`/v1`。响应统一包含 `requestId`。

### 11.1 认证

| Method | Path | 说明 |
|---|---|---|
| POST | `/auth/wechat` | 微信登录 |
| GET | `/me` | 当前用户 |

### 11.2 资料集和文档

| Method | Path | 说明 |
|---|---|---|
| GET | `/datasets` | 资料集列表 |
| POST | `/datasets` | 创建资料集 |
| PATCH | `/datasets/:id` | 修改资料集 |
| DELETE | `/datasets/:id` | 删除资料集及关联关系 |
| GET | `/documents` | 分页查询文档 |
| POST | `/documents/upload` | 上传并创建文档 |
| GET | `/documents/:id` | 文档详情 |
| GET | `/documents/:id/status` | 解析/索引状态 |
| GET | `/documents/:id/preview` | 获取原文或页面签名 URL |
| DELETE | `/documents/:id` | 删除并投递清理任务 |
| POST | `/documents/:id/reindex` | 重新索引 |

上传接口建议返回 `202 Accepted`：

```json
{
  "documentId": "doc_123",
  "jobId": "job_123",
  "status": "UPLOADED"
}
```

### 11.3 问答

| Method | Path | 说明 |
|---|---|---|
| GET | `/conversations` | 会话列表 |
| POST | `/conversations` | 创建会话 |
| GET | `/conversations/:id/messages` | 消息历史 |
| POST | `/conversations/:id/messages` | 发起问答，SSE 流式返回 |
| POST | `/messages/:id/feedback` | 有帮助/无帮助 |
| POST | `/messages/:id/favourite` | 收藏回答 |

SSE 事件：

```text
event: meta
data: {"messageId":"m1","usedTools":["vector"]}

event: token
data: {"text":"项目中"}

event: citation
data: {"citationId":"c1","page":42}

event: done
data: {"confidence":0.86}
```

若微信小程序运行环境对 SSE 支持不稳定，可降级为轮询：

```text
POST /messages -> messageId
GET /messages/:id/stream?cursor=...
```

### 11.4 面试

| Method | Path | 说明 |
|---|---|---|
| GET | `/interview/configs` | 训练资料集和模式 |
| POST | `/interview/sessions` | 创建训练 |
| GET | `/interview/sessions/:id` | 当前进度 |
| POST | `/interview/sessions/:id/answers` | 提交回答 |
| POST | `/interview/sessions/:id/finish` | 结束训练 |
| GET | `/interview/sessions/:id/feedback` | 查看反馈 |
| GET | `/review-items` | 错题/复习项 |

## 12. PostgreSQL 核心表

在现有 `kh_document` 之外增加：

```text
kh_user
  id, openid_ciphertext, nickname, avatar_url, created_at, updated_at

kh_dataset
  id, owner_id, name, description, created_at, updated_at, deleted

kh_dataset_document
  dataset_id, document_id, created_at

kh_document_tag
  document_id, tag_id

kh_ingestion_job
  id, owner_id, document_id, document_version, operation,
  status, current_stage, retry_count, error_code, error_message,
  started_at, finished_at, created_at, updated_at

kh_conversation
  id, owner_id, title, dataset_ids_json, created_at, updated_at

kh_message
  id, conversation_id, owner_id, role, content, status,
  used_tools_json, confidence, token_usage_json, created_at

kh_citation
  id, message_id, owner_id, document_id, chunk_id,
  quote, locator_json, rank, created_at

kh_interview_session
  id, owner_id, dataset_id, mode, status, current_index,
  total_questions, created_at, finished_at

kh_interview_turn
  id, session_id, question, answer, evaluation_json,
  citation_ids_json, created_at

kh_review_item
  id, owner_id, source_turn_id, title, reason, status,
  due_at, created_at, updated_at
```

所有 `owner_id`、`document_id`、`conversation_id` 建索引。数据删除使用事务更新业务状态，再异步清理外部存储和索引。

## 13. 删除和一致性

删除文档流程：

```text
API 事务：
  document.deleted = true
  ingestion_job(operation=delete)
  publish document.delete

Worker：
  删除 ES documentId 下所有 chunk
  删除 Neo4j ownerId + documentId 下 Chunk、来源关系和孤立 Entity
  删除 Mongo 正文
  删除 RustFS 原文件和预览
  job = SUCCEEDED
```

问答检索始终过滤 `document.deleted = false` 的文档 ID。即使外部索引短暂未删除，也不能被新请求召回。

## 14. 配置与密钥

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=
WECHAT_APPID=
WECHAT_SECRET=

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=user
POSTGRES_PASSWORD=
POSTGRES_DB=knowledge_hub
MONGO_URI=

RABBITMQ_URL=amqp://guest:guest@localhost:5672
ELASTICSEARCH_NODE=http://localhost:9200
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=

S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=mind-vault

LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=
EMBEDDING_MODEL=
EMBEDDING_DIMENSIONS=1536
RERANKER_ENABLED=false
```

生产环境使用 Secret Manager，不把真实密钥写入 `.env`、Docker Compose 或日志。

## 15. 可观测性

每次请求和每个异步任务生成 `requestId` / `jobId`，结构化日志至少记录：

- userId、documentId、conversationId
- graph node、tool name、耗时
- 检索命中数、top score、引用数
- LLM 模型、输入输出 token、成本
- 错误阶段和重试次数

MVP 可先使用 Pino + OpenTelemetry trace。禁止记录原始文件全文、完整用户简历和模型密钥。

## 16. 测试策略

### 单元测试

- 各格式 parser 的结构化输出和定位信息
- chunking 不丢文本、不破坏 locator
- ES 查询 builder 的 owner/dataset 过滤
- Neo4j 参数化查询
- RRF 融合排序
- LangGraph 路由分类和证据门禁
- citation 校验

### 集成测试

- 上传任务从 RabbitMQ 到 READY
- 三路检索返回统一 `RetrievalHit`
- 文档删除后 ES、Mongo、Neo4j 均不可召回
- SSE 或轮询消息流
- 面试回答、追问和反馈持久化

### 评测集

准备至少 30 个问题，覆盖：

- 精确关键词
- 同义语义
- 人物/项目关系
- 跨文档比较
- 证据不足问题
- 页码和章节定位

记录 Recall@K、引用命中率、定位正确率、无依据回答率和 P95 延迟。

## 17. 实施顺序

### 第 1 阶段：基础工程

- 补全配置、日志、JWT、用户表和全局鉴权
- 整理现有 Document 模块
- 建立数据库 migration
- 接通 RustFS、RabbitMQ、ES、Neo4j 健康检查

### 第 2 阶段：文档管线

- 将 parser 统一为 `ParsedDocument`
- 补齐 DOC、XLS、PPT、CSV、JSON
- 实现 chunk、locator 和 ingestion job
- Worker 完成 ES 关键词/向量索引

### 第 3 阶段：图谱和问答

- 实体关系抽取
- 三路检索接口
- RRF + reranker
- LangGraph 路由、证据门禁和引用
- 会话 API 和小程序流式协议

### 第 4 阶段：面试场景

- 资料集配置
- 题目生成、提交回答和追问
- 评价、引用和 ReviewItem
- 训练反馈页面所需 API

### 第 5 阶段：质量与上线

- 评测集和回归测试
- 限流、配额和成本监控
- 删除一致性测试
- 生产密钥、备份、恢复和审计

## 18. P0 验收标准

- 支持的 10 类文件都能完成上传；不支持的扩展名返回明确错误
- 上传接口不因解析耗时超时，能查询任务进度
- READY 文档能被 ES 关键词、向量和 Neo4j 分别检索
- Agent 能根据问题类型选择不同工具，复杂问题可调用多路工具
- 回答中的 citation 只能引用实际召回内容
- PDF、PPT、DOCX、XLSX 的引用可以定位到页、幻灯片、章节或工作表
- 面试 Agent 能读取指定资料集并进行至少一轮追问
- 文档删除后不能从任何检索通道召回
- 用户 A 的资料不能被用户 B 的检索命中
- 任务、Agent 节点和模型调用均可通过 `requestId/jobId` 追踪

## 19. 关键取舍

1. **向量库先复用 Elasticsearch**：MVP 减少组件和运维成本；数据量或召回性能出现瓶颈时，再拆到 Milvus/Qdrant。
2. **Worker 与 API 共代码、分进程**：降低重复开发，同时隔离长任务。
3. **LangGraph 做状态编排，不替代业务服务**：检索、鉴权、引用和删除规则由 NestJS 服务控制。
4. **结构化定位优先于纯 Markdown**：只有保留页、段落、幻灯片和表格坐标，原文跳转体验才可靠。
5. **图谱作为复杂问题工具，不默认参与所有问题**：减少抽取成本和错误关系对简单问答的干扰。
