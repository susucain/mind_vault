import neo4j from 'neo4j-driver';
import {
  runEntityMerge,
  type EntityMergeClient,
} from '../src/graph/entity-merge';

/**
 * 存量实体合并入口（G2）：默认预演，确认报告后加 `--apply` 落库。
 * 用法：`npm run graph:merge-entities -- --owner 10001 [--apply]`
 */
export function parseMergeArgs(argv: string[]): {
  ownerId: string;
  apply: boolean;
} {
  let ownerId = '';
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--owner') {
      ownerId = argv[index + 1] ?? '';
      index += 1;
    } else if (argv[index] === '--apply') {
      apply = true;
    }
  }
  if (!ownerId) throw new Error('缺少 --owner <ownerId>');
  return { ownerId, apply };
}

async function main() {
  const { ownerId, apply } = parseMergeArgs(process.argv.slice(2));
  const driver = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASSWORD ?? '12345678',
    ),
  );
  const session = driver.session();
  try {
    const client = {
      run: (cypher: string, params: Record<string, unknown>) =>
        session.run(cypher, params),
    } as unknown as EntityMergeClient;
    const report = await runEntityMerge(client, {
      ownerId,
      apply,
      logger: (message) => console.log(message),
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
