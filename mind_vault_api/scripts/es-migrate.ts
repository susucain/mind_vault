import { Client } from '@elastic/elasticsearch';
import {
  migrateChunkIndex,
  parseMigrateArgs,
  type MigrateClient,
} from '../src/retrieval/es/es-migrate';

/**
 * 索引迁移入口（I1/I7）：`npm run es:migrate`。
 * 建新版本索引 → 从旧索引重灌 → 切别名；旧索引保留，回滚时 `--version <旧版本>` 切回。
 */
async function main() {
  const { version, reindex } = parseMigrateArgs(process.argv.slice(2));
  const dimensions = Number(process.env.EMBEDDING_DIMENSION ?? 1024);
  // 真实客户端方法签名比迁移所需的最小面更宽（重载 + 严格 action 类型），
  // 这里在 CLI 边界收敛到 MigrateClient；假实现由单测注入。
  const client = new Client({
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
  });
  const result = await migrateChunkIndex(client as unknown as MigrateClient, {
    version,
    dimensions,
    reindex,
    logger: (message) => console.log(message),
  });
  console.log(JSON.stringify(result, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
