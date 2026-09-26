import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { MemoryService } from './memory.service';

function buildService(
  input: {
    nearestRows?: unknown[];
    extracted?: unknown[];
    activeCount?: number;
    existing?: unknown;
  } = {},
) {
  const inserts: unknown[][] = [];
  const touches: unknown[][] = [];
  const queries: { sql: string; params: unknown[] }[] = [];
  const memories = {
    query: jest.fn((sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO kh_user_memory')) inserts.push(params);
      if (sql.includes('hit_count = hit_count + 1')) touches.push(params);
      return Promise.resolve(input.nearestRows ?? []);
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOneBy: jest
      .fn()
      .mockResolvedValue(
        input.existing === undefined ? { id: 'memory_1' } : input.existing,
      ),
    findOneByOrFail: jest.fn().mockResolvedValue({ id: 'memory_1' }),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(input.activeCount ?? 1),
  };
  const embedding = { embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]) };
  const model = {
    extract: jest.fn().mockResolvedValue(input.extracted ?? []),
    extractExplicit: jest.fn().mockResolvedValue({
      content: '',
      kind: 'fact',
    }),
  };
  const service = new MemoryService(
    memories as never,
    embedding as never,
    model as never,
  );
  return { service, memories, embedding, model, inserts, touches, queries };
}

describe('MemoryService', () => {
  it('inserts a new memory with its owner and vector literal', async () => {
    const { service, memories, inserts } = buildService();

    await service.create('user_1', { content: ' 用户偏好简短回答 ' });

    expect(inserts).toHaveLength(1);
    // 参数顺序: id, owner_id, content, kind, source_conversation_id, embedding
    expect(inserts[0][1]).toBe('user_1');
    expect(inserts[0][2]).toBe('用户偏好简短回答');
    expect(inserts[0][3]).toBe('fact');
    expect(inserts[0][5]).toBe('[0.1,0.2]');
    expect(memories.update).not.toHaveBeenCalled();
  });

  it('updates the closest memory instead of inserting a duplicate', async () => {
    const { service, memories, inserts } = buildService({
      nearestRows: [
        {
          id: 'memory_dup',
          content: '用户喜欢详细的回答',
          kind: 'fact',
          score: '0.95',
        },
      ],
    });

    await service.create('user_1', {
      content: '用户偏好简短回答',
      kind: 'preference',
    });

    expect(inserts).toHaveLength(0);
    expect(memories.update).toHaveBeenCalledWith(
      { id: 'memory_dup', ownerId: 'user_1' },
      { content: '用户偏好简短回答', kind: 'preference' },
    );
    // 去重比较必须在同一 owner 范围内，避免跨用户合并
    expect(memories.query).toHaveBeenCalledWith(
      expect.stringContaining('kh_user_memory'),
      expect.arrayContaining(['user_1']),
    );
  });

  it('drops memories below the recall threshold and records the hits', async () => {
    const { service, touches, queries } = buildService({
      nearestRows: [
        { id: 'm4', content: '正在准备后端面试', kind: 'goal', score: '0.95' },
        { id: 'm1', content: '偏好 Go', kind: 'preference', score: '0.91' },
        { id: 'm2', content: '使用 Mac', kind: 'fact', score: '0.85' },
        { id: 'm3', content: '喜欢咖啡', kind: 'fact', score: '0.7' },
      ],
    });

    const items = await service.recallMemories('user_1', '我会什么语言？');

    expect(items.map((item) => item.id)).toEqual(['m4', 'm1', 'm2']);
    expect(items[0].score).toBe(0.95);
    expect(queries[0].params[1]).toBe('user_1');
    expect(touches[0][1]).toEqual(['m4', 'm1', 'm2']);
  });

  it('skips recall for a blank query', async () => {
    const { service, embedding, queries } = buildService();

    const items = await service.recallMemories('user_1', '   ');

    expect(items).toEqual([]);
    expect(embedding.embedQuery).not.toHaveBeenCalled();
    expect(queries).toHaveLength(0);
  });

  it('takes memories by kind without going through vector recall', async () => {
    const { service, memories, embedding, touches } = buildService();
    memories.find.mockResolvedValue([
      { id: 'm1', content: '偏好先给结论', kind: 'preference' },
      { id: 'm2', content: '目标是三个月内转岗', kind: 'goal' },
    ]);

    const notes = await service.recallByKinds('user_1', ['preference', 'goal']);

    expect(notes).toEqual([
      { id: 'm1', content: '偏好先给结论', kind: 'preference' },
      { id: 'm2', content: '目标是三个月内转岗', kind: 'goal' },
    ]);
    expect(memories.find).toHaveBeenCalledWith({
      where: {
        ownerId: 'user_1',
        status: 'ACTIVE',
        kind: In(['preference', 'goal']),
      },
      order: { updatedAt: 'DESC' },
      take: 3,
    });
    // 按类型取用不涉及相似度，不该多付一次 embedding 调用
    expect(embedding.embedQuery).not.toHaveBeenCalled();
    expect(touches[0][1]).toEqual(['m1', 'm2']);
  });

  it('reports a missing memory when nothing was deleted', async () => {
    const { service, memories } = buildService();
    memories.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('user_1', 'memory_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('supersedes a related memory when a new statement replaces it', async () => {
    const { service, memories, inserts } = buildService({
      nearestRows: [
        {
          id: 'old_memory',
          content: '用户偏好 Go',
          kind: 'preference',
          score: '0.8',
        },
      ],
    });

    await service.create('user_1', {
      content: '用户偏好 Java',
      kind: 'preference',
    });

    expect(memories.update).toHaveBeenCalledWith(
      { id: 'old_memory', ownerId: 'user_1' },
      { status: 'SUPERSEDED' },
    );
    expect(inserts).toHaveLength(1);
  });

  it('extracts memories from compacted turns and drops document derived items', async () => {
    const { service, model, inserts } = buildService({
      extracted: [
        { content: '用户偏好简短回答', kind: 'preference', confidence: 0.9 },
        {
          content: '根据资料，Kafka 用于削峰填谷',
          kind: 'fact',
          confidence: 0.9,
        },
      ],
    });

    const saved = await service.extractFromTurns({
      ownerId: 'user_1',
      conversationId: 'conversation_1',
      turns: [
        { role: 'user', content: '以后回答简短点' },
        { role: 'assistant', content: '好的，我会尽量简短。' },
      ],
    });

    // 助手回答也在抽取输入里，但资料派生内容会被挡在入库之前
    expect(model.extract).toHaveBeenCalledWith([
      { role: 'user', content: '以后回答简短点' },
      { role: 'assistant', content: '好的，我会尽量简短。' },
    ]);
    expect(saved).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0][2]).toBe('用户偏好简短回答');
    expect(inserts[0][4]).toBe('conversation_1');
  });

  it('skips extraction when there are no turns', async () => {
    const { service, model } = buildService();

    const saved = await service.extractFromTurns({
      ownerId: 'user_1',
      conversationId: 'conversation_1',
      turns: [],
    });

    expect(saved).toBe(0);
    expect(model.extract).not.toHaveBeenCalled();
  });

  it('evicts the coldest memories beyond the per-user cap', async () => {
    const { service, queries } = buildService({
      extracted: [
        { content: '用户目标：三个月内转岗', kind: 'goal', confidence: 0.9 },
      ],
      activeCount: 202,
    });

    await service.extractFromTurns({
      ownerId: 'user_1',
      conversationId: 'conversation_1',
      turns: [{ role: 'user', content: '我想三个月内转岗' }],
    });

    const evicted = queries.find((query) =>
      query.sql.includes("SET status = 'SUPERSEDED'"),
    );
    expect(evicted?.params).toEqual(['user_1', 2]);
  });

  it('recomputes the vector when the content is edited', async () => {
    const { service, memories, embedding, queries } = buildService();

    await service.update('user_1', 'memory_1', {
      content: ' 用户偏好简短回答 ',
    });

    expect(embedding.embedQuery).toHaveBeenCalledWith('用户偏好简短回答');
    const vectorUpdate = queries.find((query) =>
      query.sql.includes('SET embedding = $3::vector'),
    );
    expect(vectorUpdate?.params).toEqual(['user_1', 'memory_1', '[0.1,0.2]']);
    expect(memories.update).toHaveBeenCalledWith(
      { id: 'memory_1', ownerId: 'user_1' },
      { content: '用户偏好简短回答' },
    );
  });

  it('restores a superseded memory without recomputing its vector', async () => {
    const { service, memories, embedding, queries } = buildService();

    await service.update('user_1', 'memory_1', { status: 'ACTIVE' });

    expect(embedding.embedQuery).not.toHaveBeenCalled();
    expect(queries).toHaveLength(0);
    expect(memories.update).toHaveBeenCalledWith(
      { id: 'memory_1', ownerId: 'user_1' },
      { status: 'ACTIVE' },
    );
  });

  it('rejects an empty edit and an edit on a missing memory', async () => {
    const { service, memories } = buildService();

    await expect(
      service.update('user_1', 'memory_1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    memories.findOneBy.mockResolvedValue(null);
    await expect(
      service.update('user_1', 'memory_1', { kind: 'goal' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters the list by status and defaults to active memories', async () => {
    const { service, memories } = buildService();

    await service.list('user_1');
    expect(memories.find).toHaveBeenCalledWith({
      where: { ownerId: 'user_1', status: 'ACTIVE' },
      order: { updatedAt: 'DESC' },
    });

    await service.list('user_1', 'SUPERSEDED');
    expect(memories.find).toHaveBeenLastCalledWith({
      where: { ownerId: 'user_1', status: 'SUPERSEDED' },
      order: { updatedAt: 'DESC' },
    });
  });

  it('clears every memory of the owner and reports the count', async () => {
    const { service, memories } = buildService();
    memories.delete.mockResolvedValue({ affected: 7 });

    await expect(service.clear('user_1')).resolves.toEqual({ deleted: 7 });
    expect(memories.delete).toHaveBeenCalledWith({ ownerId: 'user_1' });
  });

  it('saves a fact immediately when the user explicitly asks to remember it', async () => {
    const { service, model, inserts } = buildService();
    model.extractExplicit = jest.fn().mockResolvedValue({
      content: '用户今年 30 岁',
      kind: 'fact',
    });

    await expect(
      service.handleExplicit({
        ownerId: 'user_1',
        conversationId: 'conversation_1',
        question: '记住我的年龄',
        history: [{ role: 'user', content: '我今年 30 岁' }],
      }),
    ).resolves.toMatchObject({
      action: 'saved',
      content: '用户今年 30 岁',
    });

    expect(model.extractExplicit).toHaveBeenCalled();
    expect(inserts[0][2]).toBe('用户今年 30 岁');
  });

  it('asks for the missing fact instead of saving an incomplete instruction', async () => {
    const { service, model, inserts } = buildService();
    model.extractExplicit = jest.fn().mockResolvedValue({
      content: '',
      kind: 'fact',
    });

    await expect(
      service.handleExplicit({
        ownerId: 'user_1',
        conversationId: 'conversation_1',
        question: '记住我的年龄',
        history: [],
      }),
    ).resolves.toEqual({
      action: 'clarification_required',
      answer: '你的年龄是多少？告诉我后我再帮你记住。',
    });

    expect(inserts).toHaveLength(0);
  });

  it('does not treat a normal statement as an explicit save request', async () => {
    const { service, model } = buildService();

    await expect(
      service.handleExplicit({
        ownerId: 'user_1',
        conversationId: 'conversation_1',
        question: '我今年 30 岁',
        history: [],
      }),
    ).resolves.toEqual({ action: 'none' });

    expect(model.extractExplicit).not.toHaveBeenCalled();
  });

  it('does not delete existing memories when the user declines saving', async () => {
    const { service, memories } = buildService();

    await expect(
      service.handleExplicit({
        ownerId: 'user_1',
        conversationId: 'conversation_1',
        question: '不要记住我的年龄',
        history: [],
      }),
    ).resolves.toEqual({
      action: 'not_saved',
      answer: '好的，这次不会把这条信息保存为长期记忆。',
    });

    expect(memories.delete).not.toHaveBeenCalled();
  });
});
