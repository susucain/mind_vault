import { MemoryModelService } from './memory-model.service';

function buildService(payload: unknown) {
  const gateway = {
    invokeJson: jest.fn(
      (
        _kind: string,
        _messages: unknown[],
        _thinking: boolean,
        parse: (raw: unknown) => unknown,
      ) => Promise.resolve({ data: parse(payload), usage: {} }),
    ),
  };
  return { service: new MemoryModelService(gateway as never), gateway };
}

describe('MemoryModelService', () => {
  it('keeps confident items, trims them and caps the batch', async () => {
    const { service } = buildService({
      memories: [
        {
          content: '  用户偏好简短回答  ',
          kind: 'preference',
          confidence: 0.9,
        },
        { content: '用户正在准备后端面试', kind: 'fact', confidence: 0.8 },
        { content: '用户目标：三个月内转岗', kind: 'goal', confidence: 0.7 },
        { content: '用户可能喜欢咖啡', kind: 'fact', confidence: 0.2 },
        { content: '用户住在杭州', kind: 'fact', confidence: 0.9 },
      ],
    });

    const items = await service.extract([
      { role: 'user', content: '我在杭州' },
    ]);

    expect(items).toHaveLength(3);
    expect(items[0].content).toBe('用户偏好简短回答');
    expect(items.map((item) => item.content)).not.toContain('用户可能喜欢咖啡');
  });

  it('degrades to no memories when the model returns unexpected shapes', async () => {
    const { service } = buildService({
      memories: [{ content: '', kind: 'unexpected', confidence: 5 }],
    });

    const items = await service.extract([
      { role: 'user', content: '随便聊聊' },
    ]);

    // content 被降级为空串后丢弃；kind / confidence 非法值回落到默认档
    expect(items).toEqual([]);
  });

  it('returns nothing when the payload is not an object list', async () => {
    const { service } = buildService({ memories: 'oops' });

    await expect(
      service.extract([{ role: 'user', content: '你好' }]),
    ).resolves.toEqual([]);
  });
});
