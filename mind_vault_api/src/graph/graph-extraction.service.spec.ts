import { GraphExtractionService } from './graph-extraction.service';

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
      invokeJson: jest.fn().mockResolvedValue({ data: { entities, relations } }),
    };
    const service = new GraphExtractionService(gateway as never);

    await expect(
      service.extract({ text: '内容' } as never),
    ).resolves.toMatchObject({
      entities: expect.arrayContaining([
        { name: 'Entity 0', type: 'CONCEPT' },
      ]),
    });

    const result = await service.extract({ text: '内容' } as never);
    expect(result.entities).toHaveLength(30);
    expect(result.relations).toHaveLength(50);
  });
});
