export interface EnvironmentInput {
  [key: string]: string | undefined;
}

export function parseBoolean(
  value: string | undefined,
  fallback = false,
): boolean {
  if (value === undefined) return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildConfiguration(env: EnvironmentInput = process.env) {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: parseNumber(env.PORT, 3000),
    runtime: {
      standalone: parseBoolean(env.APP_STANDALONE, false),
    },
    auth: {
      jwtSecret: env.JWT_SECRET ?? 'mind-vault-development-secret',
      devLoginEnabled: parseBoolean(
        env.DEV_AUTH_ENABLED,
        (env.NODE_ENV ?? 'development') !== 'production',
      ),
      // 开发账号：不落库，登录时直接与环境变量比对。
      // id 必须是数字，因为业务表的 owner_id 是 BIGINT（默认绑定现有 owner 10001）。
      devAccount: {
        id: env.DEV_ACCOUNT_ID ?? '10001',
        username: (env.DEV_ACCOUNT_USERNAME ?? 'dev').trim().toLowerCase(),
        password: env.DEV_ACCOUNT_PASSWORD ?? '123456',
        nickname: env.DEV_ACCOUNT_NICKNAME ?? '开发用户',
      },
    },
    models: {
      fast: env.FAST_MODEL,
      reasoning: env.REASONING_MODEL,
      embedding: env.EMBEDDING_MODEL,
      fastThinking: parseBoolean(env.FAST_MODEL_ENABLE_THINKING, false),
      reasoningThinking: parseBoolean(
        env.REASONING_MODEL_ENABLE_THINKING,
        false,
      ),
    },
    retrieval: {
      // ES kNN 对 cosine 返回的 _score 为 (1 + 余弦相似度) / 2，落在 0~1。
      // 默认 0.75 约等于余弦 0.5：低于它视为资料中没有相关内容，需要按真实语料校准。
      vectorMinScore: parseNumber(env.RETRIEVAL_VECTOR_MIN_SCORE, 0.75),
    },
    chat: {
      // 每轮回答后追加一次「追问推荐」调用。关掉即完全不调模型，
      // 前端回落到静态通用引导，其余功能不受影响。
      followupSuggestionsEnabled: parseBoolean(
        env.CHAT_FOLLOWUP_SUGGESTIONS_ENABLED,
        true,
      ),
      // 追问推荐的等待上限（毫秒）：超时即放弃并回落，
      // 不让用户为「回答之外的东西」多等。
      followupTimeoutMs: parseNumber(env.CHAT_FOLLOWUP_TIMEOUT_MS, 3000),
    },
    ingestion: {
      // 摄取 worker 是否消费队列（start:worker 脚本会置为 true）
      workerEnabled: parseBoolean(env.INGESTION_WORKER_ENABLED, false),
    },
    parsing: {
      // 扫件判定阈值（A2）：PDF 平均每页字符低于该值即疑似扫描件
      minCharsPerPage: parseNumber(env.PARSE_MIN_CHARS_PER_PAGE, 100),
    },
    graph: {
      // 图谱 worker 是否消费队列；默认跟随摄取 worker，避免多一个必须同步的开关
      workerEnabled: parseBoolean(env.INGESTION_WORKER_ENABLED, false),
      // 单进程并发（RabbitMQ prefetch）。需与模型服务配额匹配，可按需放大。
      workerConcurrency: parseNumber(env.GRAPH_WORKER_CONCURRENCY, 6),
      // 短于该字符数的块不入图（标题行、目录、表格残片等低价值块）
      minChunkChars: parseNumber(env.GRAPH_MIN_CHUNK_CHARS, 80),
      // 抽取输出上限：prompt 声明与截断阈值共用，超过即丢弃
      maxEntities: parseNumber(env.GRAPH_MAX_ENTITIES, 15),
      maxRelations: parseNumber(env.GRAPH_MAX_RELATIONS, 30),
      // 单次抽取的输出 token 上限（15 实体 + 30 关系足够容纳）
      extractionMaxTokens: parseNumber(env.GRAPH_EXTRACTION_MAX_TOKENS, 2000),
    },
    langfuse: {
      enabled: parseBoolean(env.LANGFUSE_ENABLED, false),
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      // 用于在 Langfuse 里区分环境，默认跟随 NODE_ENV
      environment:
        env.LANGFUSE_TRACING_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
      // 批量导出间隔（秒）：进程被强杀时最多丢失这一段内的 span
      flushInterval: parseNumber(env.LANGFUSE_FLUSH_INTERVAL, 2),
    },
    infrastructure: {
      postgres: {
        host: env.POSTGRES_HOST ?? 'localhost',
        port: parseNumber(env.POSTGRES_PORT, 5432),
      },
      mongodb: {
        uri:
          env.MONGO_URI ??
          'mongodb://mongo_user:mongo_pass123@localhost:27017/knowledge_hub?authSource=admin',
      },
      rabbitmq: {
        url: env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
      },
      elasticsearch: {
        node: env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
      },
      neo4j: {
        uri: env.NEO4J_URI ?? 'bolt://localhost:7687',
        user: env.NEO4J_USER ?? 'neo4j',
      },
      rustfs: {
        endpoint:
          env.S3_ENDPOINT ?? env.RUSTFS_ENDPOINT ?? 'http://localhost:9000',
        bucket: env.S3_BUCKET ?? env.RUSTFS_BUCKET ?? 'mind-vault',
        enabled: parseBoolean(env.STORAGE_ENABLED ?? env.RUSTFS_ENABLED, false),
      },
    },
  };
}

export default () => buildConfiguration();
