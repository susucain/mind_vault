import { buildConfiguration, parseBoolean } from './configuration';

describe('configuration', () => {
  it('parses boolean environment values consistently', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('FALSE')).toBe(false);
    expect(parseBoolean(undefined, true)).toBe(true);
  });

  it('maps model routing from environment variables without source defaults', () => {
    const config = buildConfiguration({
      NODE_ENV: 'test',
      PORT: '4010',
      FAST_MODEL: 'fast-from-env',
      REASONING_MODEL: 'reasoning-from-env',
      EMBEDDING_MODEL: 'embedding-from-env',
    });

    expect(config.port).toBe(4010);
    expect(config.models.fast).toBe('fast-from-env');
    expect(config.models.reasoning).toBe('reasoning-from-env');
    expect(config.models.embedding).toBe('embedding-from-env');
    expect(config.models.fastThinking).toBe(false);
  });

  it('does not supply model names when the environment is missing them', () => {
    const config = buildConfiguration({});

    expect(config.models.fast).toBeUndefined();
    expect(config.models.reasoning).toBeUndefined();
    expect(config.models.embedding).toBeUndefined();
    expect(config.retrieval.vectorMinScore).toBe(0.7);
  });

  it('collects the worker switches and graph tuning into configuration', () => {
    const defaults = buildConfiguration({ INGESTION_WORKER_ENABLED: 'true' });

    expect(defaults.ingestion.workerEnabled).toBe(true);
    // 图谱 worker 默认跟随摄取 worker，避免多一个必须同步的开关
    expect(defaults.graph.workerEnabled).toBe(true);
    expect(defaults.graph.workerConcurrency).toBe(6);
    expect(defaults.graph.minChunkChars).toBe(80);
    expect(defaults.graph.maxEntities).toBe(15);
    expect(defaults.graph.maxRelations).toBe(30);
    expect(defaults.graph.extractionMaxTokens).toBe(2000);
  });

  it('lets the graph tuning be overridden from the environment', () => {
    const config = buildConfiguration({
      GRAPH_WORKER_CONCURRENCY: '8',
      GRAPH_MIN_CHUNK_CHARS: '0',
      GRAPH_MAX_ENTITIES: '20',
      GRAPH_MAX_RELATIONS: '40',
      GRAPH_EXTRACTION_MAX_TOKENS: '1200',
    });

    expect(config.graph.workerConcurrency).toBe(8);
    expect(config.graph.minChunkChars).toBe(0);
    expect(config.graph.maxEntities).toBe(20);
    expect(config.graph.maxRelations).toBe(40);
    expect(config.graph.extractionMaxTokens).toBe(1200);
    expect(config.graph.workerEnabled).toBe(false);
  });

  it('supports container service names for dependency health checks', () => {
    const config = buildConfiguration({
      RABBITMQ_HOST: 'rabbitmq',
      RABBITMQ_PORT: '5672',
      ELASTICSEARCH_HOST: 'es',
      ELASTICSEARCH_PORT: '9200',
      NEO4J_HOST: 'neo4j',
      NEO4J_PORT: '7687',
    });

    expect(config.infrastructure.rabbitmq).toMatchObject({
      host: 'rabbitmq',
      port: 5672,
    });
    expect(config.infrastructure.elasticsearch).toMatchObject({
      host: 'es',
      port: 9200,
    });
    expect(config.infrastructure.neo4j).toMatchObject({
      host: 'neo4j',
      port: 7687,
    });
  });
});
