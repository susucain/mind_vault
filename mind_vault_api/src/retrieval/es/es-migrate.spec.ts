/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  chunkIndexName,
  chunkMappingVersion,
  CHUNK_INDEX_VERSION,
} from './chunk-index-mapping';
import { migrateChunkIndex, parseMigrateArgs } from './es-migrate';

const target = chunkIndexName(CHUNK_INDEX_VERSION);

function buildClient(input: {
  aliasIndex?: string;
  exists?: boolean;
  reindex?: { created?: number; failures?: unknown[] };
}) {
  const client = {
    indices: {
      exists: jest.fn().mockResolvedValue(input.exists ?? false),
      create: jest.fn().mockResolvedValue({}),
      getAlias: jest.fn(() =>
        input.aliasIndex
          ? Promise.resolve({ [input.aliasIndex]: { aliases: {} } })
          : Promise.reject(new Error('alias_not_found')),
      ),
      updateAliases: jest.fn().mockResolvedValue({}),
    },
    reindex: jest.fn().mockResolvedValue(input.reindex ?? { created: 0 }),
  };
  return client;
}

describe('migrateChunkIndex', () => {
  it('creates the version index and points the alias when the alias is missing', async () => {
    const client = buildClient({});
    const result = await migrateChunkIndex(client, {
      dimensions: 1024,
    });

    expect(client.indices.create).toHaveBeenCalledWith({
      index: target,
      mappings: expect.objectContaining({
        _meta: { mappingVersion: chunkMappingVersion(1024) },
      }),
    });
    expect(client.reindex).not.toHaveBeenCalled();
    // 别名不存在（首次引导）时只发 add：发 remove 会让整条请求 404，add 也落不下去
    expect(client.indices.updateAliases).toHaveBeenCalledWith({
      actions: [{ add: { index: target, alias: 'mind_vault_chunks' } }],
    });
    expect(result).toMatchObject({ to: target, switched: true, reindexed: 0 });
  });

  it('removes the old target before pointing the alias at the new version', async () => {
    const client = buildClient({
      aliasIndex: 'mind_vault_chunks_v0',
      exists: false,
      reindex: { created: 42 },
    });

    await migrateChunkIndex(client, {});

    expect(client.indices.updateAliases).toHaveBeenCalledWith({
      actions: [
        { remove: { index: '*', alias: 'mind_vault_chunks' } },
        { add: { index: target, alias: 'mind_vault_chunks' } },
      ],
    });
  });

  it('reindexes from the current index before switching the alias', async () => {
    const client = buildClient({
      aliasIndex: 'mind_vault_chunks_v0',
      exists: false,
      reindex: { created: 42 },
    });

    const result = await migrateChunkIndex(client, {});

    expect(client.reindex).toHaveBeenCalledWith({
      source: { index: 'mind_vault_chunks_v0' },
      dest: { index: target },
      wait_for_completion: true,
    });
    expect(result).toMatchObject({
      from: 'mind_vault_chunks_v0',
      to: target,
      reindexed: 42,
      switched: true,
    });
  });

  it('is a no-op when the alias already points to the target version', async () => {
    const client = buildClient({ aliasIndex: target, exists: true });

    const result = await migrateChunkIndex(client, {});

    expect(client.indices.create).not.toHaveBeenCalled();
    expect(client.reindex).not.toHaveBeenCalled();
    expect(client.indices.updateAliases).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      to: target,
      switched: false,
      created: false,
    });
  });

  it('does not switch the alias when reindex reports failures', async () => {
    const client = buildClient({
      aliasIndex: 'mind_vault_chunks_v0',
      reindex: { failures: [{ reason: 'boom' }] },
    });

    await expect(migrateChunkIndex(client as never, {})).rejects.toThrow(
      '_reindex 存在失败条目',
    );
    expect(client.indices.updateAliases).not.toHaveBeenCalled();
  });

  it('skips the data copy when reindex is disabled', async () => {
    const client = buildClient({ aliasIndex: 'mind_vault_chunks_v0' });

    await migrateChunkIndex(client, { reindex: false });

    expect(client.reindex).not.toHaveBeenCalled();
    expect(client.indices.updateAliases).toHaveBeenCalled();
  });
});

describe('parseMigrateArgs', () => {
  it('reads the target version and reindex switch', () => {
    expect(parseMigrateArgs([])).toEqual({ version: undefined, reindex: true });
    expect(parseMigrateArgs(['--version', '3'])).toEqual({
      version: 3,
      reindex: true,
    });
    expect(parseMigrateArgs(['--version=2', '--skip-reindex'])).toEqual({
      version: 2,
      reindex: false,
    });
  });

  it('ignores an invalid version', () => {
    expect(parseMigrateArgs(['--version', 'abc']).version).toBeUndefined();
    expect(parseMigrateArgs(['--version', '0']).version).toBeUndefined();
  });
});
