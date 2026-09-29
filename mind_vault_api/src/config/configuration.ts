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
