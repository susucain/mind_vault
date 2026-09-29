import { GraphExtractionService } from './graph-extraction.service';

/** Langfuse 未启用时的形态：直接执行，不做任何包装 */
const tracingOff = {
  trace: (_context: unknown, fn: () => unknown) => fn(),
} as never;

describe('GraphExtractionService', () => {
  it('limits oversized model extraction results before schema validation', async () => {
    const entities = Array.from({ length: 31 }, (_, index) => ({
      name: `Entity ${index}`,
      type: 'CONCEPT',
    }));
    const relations = Array.from({ length: 51 }, (_, index) => ({
      source: 'Entity 0',
      target: 'Entity 1',
      type: 'RELATED_TO',
      confidence: 0.8,
    }));
    const gateway = {
      invokeJson: jest.fn(
        (
          _kind: string,
          _messages: unknown,
          _thinking: boolean,
          parse: (raw: unknown) => {
            entities: unknown[];
            relations: unknown[];
          },
        ) => Promise.resolve({ data: parse({ entities, relations }) }),
      ),
    };
    const service = new GraphExtractionService(gateway as never, tracingOff);

    await expect(
      service.extract({ text: '内容' } as never),
    ).resolves.toMatchObject({
      entities: expect.arrayContaining([{ name: 'Entity 0', type: 'CONCEPT' }]),
    });

    const result = await service.extract({ text: '内容' } as never);
    expect(result.entities).toHaveLength(30);
    expect(result.relations).toHaveLength(50);
  });
});
