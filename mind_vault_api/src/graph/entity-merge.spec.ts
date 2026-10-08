import {
  EntityMergeRow,
  planEntityMerge,
  runEntityMerge,
} from './entity-merge';

function recordValue(row: EntityMergeRow, key: string): unknown {
  if (key === 'id') return row.id;
  if (key === 'name') return row.name;
  if (key === 'aliases') return row.aliases;
  return undefined;
}

function listClient(rows: EntityMergeRow[]) {
  return {
    run: jest.fn((cypher: string) => {
      if (cypher.includes('RETURN entity.normalizedName AS id')) {
        return Promise.resolve({
          records: rows.map((row) => ({
            get: (key: string) => recordValue(row, key),
          })),
        });
      }
      return Promise.resolve({ records: [] });
    }),
  };
}

const rows: EntityMergeRow[] = [
  { id: 'kafka', name: 'Kafka' },
  { id: 'elasticsearch es', name: 'Elasticsearch (ES)', aliases: ['ES'] },
  { id: 'elasticsearch', name: 'Elasticsearch' },
  { id: '消息队列', name: '消息队列' },
];

describe('planEntityMerge', () => {
  it('groups rows by the new normalization rule and reports before/after counts', () => {
    const plan = planEntityMerge('user_1', rows);

    expect(plan.before).toBe(4);
    expect(plan.after).toBe(3);
    expect(plan.groups).toEqual([
      {
        target: 'elasticsearch',
        canonicalId: 'elasticsearch',
        duplicates: [
          {
            id: 'elasticsearch es',
            name: 'Elasticsearch (ES)',
            aliases: ['ES'],
          },
        ],
      },
    ]);
  });

  it('renames the first node when no existing node already carries the target key', () => {
    const plan = planEntityMerge('user_1', [
      { id: 'es_node', name: 'Elasticsearch' },
      { id: 'es_alias', name: 'Elasticsearch', aliases: ['ES'] },
    ]);

    expect(plan.groups).toEqual([
      {
        target: 'elasticsearch',
        canonicalId: 'es_node',
        duplicates: [
          { id: 'es_alias', name: 'Elasticsearch', aliases: ['ES'] },
        ],
      },
    ]);
  });
});

describe('runEntityMerge', () => {
  it('only reports a plan when apply is false', async () => {
    const client = listClient(rows);

    const report = await runEntityMerge(client, { ownerId: 'user_1' });

    expect(report).toMatchObject({
      ownerId: 'user_1',
      before: 4,
      after: 3,
      mergedNodes: 1,
      applied: false,
    });
    // 预演不写库：只做了一次列举查询
    expect(client.run).toHaveBeenCalledTimes(1);
  });

  it('migrates mentions, relations and aliases before deleting duplicates', async () => {
    const client = listClient([
      { id: 'es_node', name: 'Elasticsearch' },
      { id: 'es_alias', name: 'Elasticsearch', aliases: ['ES'] },
    ]);

    const report = await runEntityMerge(client, {
      ownerId: 'user_1',
      apply: true,
    });

    expect(report.applied).toBe(true);
    const queries = client.run.mock.calls.map((call) => call[0]);
    // 保留点改名 → 目标键
    expect(
      queries.some(
        (query) =>
          query.includes('SET canonical.normalizedName = $target') &&
          query.includes('MATCH (canonical:Entity'),
      ),
    ).toBe(true);
    // 迁移 MENTIONED_IN
    expect(
      queries.some(
        (query) =>
          query.includes('MERGE (target)-[:MENTIONED_IN') &&
          query.includes('DELETE mention'),
      ),
    ).toBe(true);
    // 迁移出边与入边（按关系类型逐个处理）
    expect(
      queries.some(
        (query) =>
          query.includes('MERGE (target)-[merged:USED_FOR') &&
          query.includes('DELETE relation'),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.includes('MERGE (other)-[merged:USED_FOR') &&
          query.includes('DELETE relation'),
      ),
    ).toBe(true);
    // 收集别名并删除旧节点
    expect(queries.some((query) => query.includes('DETACH DELETE dup'))).toBe(
      true,
    );
    const aliasCall = client.run.mock.calls.find((call) =>
      call[0].includes('DETACH DELETE dup'),
    );
    expect(aliasCall?.[1]).toEqual({
      ownerId: 'user_1',
      dupId: 'es_alias',
      target: 'elasticsearch',
      aliasCandidates: ['ES', 'Elasticsearch'],
    });
  });
});
