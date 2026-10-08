import {
  GraphExtractionService,
  GRAPH_EXTRACTION_PROMPT_VERSION,
} from './graph-extraction.service';
import { GraphExtractionInput } from './graph-types';

/** Langfuse 未启用时的形态：直接执行，不做任何包装 */
const tracingOff = {
  trace: (_context: unknown, fn: () => unknown) => fn(),
} as never;

interface ExtractionPayload {
  entities: unknown[];
  relations: unknown[];
}

function buildService(payload: ExtractionPayload) {
  const gateway = {
    invokeJson: jest.fn(
      (
        _kind: string,
        _messages: unknown,
        _thinking: boolean,
        parse: (raw: unknown) => unknown,
      ) => Promise.resolve({ data: parse(payload) }),
    ),
  };
  return {
    service: new GraphExtractionService(gateway as never, tracingOff),
    gateway,
  };
}

const input: GraphExtractionInput = {
  chunkId: 'chunk_1',
  ownerId: 'user_1',
  documentId: 'doc_1',
  documentVersion: 1,
  text: '内容',
};

describe('GraphExtractionService', () => {
  it('truncates oversized results and reports how much was cut (G3)', async () => {
    const entities = Array.from({ length: 31 }, (_, index) => ({
      name: `Entity ${index}`,
      type: 'CONCEPT',
    }));
    const relations = Array.from({ length: 51 }, () => ({
      source: 'Entity 0',
      target: 'Entity 1',
      type: 'RELATED_TO',
      confidence: 0.8,
    }));
    const { service, gateway } = buildService({ entities, relations });

    const result = await service.extract(input);

    expect(result.extraction.entities).toHaveLength(15);
    expect(result.extraction.relations).toHaveLength(30);
    // 截断量必须在裁剪前统计，否则恒为 0
    expect(result.truncated).toEqual({ entities: 16, relations: 21 });
    expect(gateway.invokeJson).toHaveBeenCalledWith(
      'fast',
      expect.any(Array),
      false,
      expect.any(Function),
      { maxTokens: 2000 },
    );
  });

  it('injects document title, title path, fragment order and neighbors into the prompt (G1)', async () => {
    const { service, gateway } = buildService({ entities: [], relations: [] });

    await service.extract({
      ...input,
      documentTitle: '架构设计',
      titlePath: ['第二章', '存储'],
      chunkOrder: 4,
      previousText: '上文片段',
      nextText: '下文片段',
    });

    const messages = gateway.invokeJson.mock.calls[0][1] as {
      content: string;
    }[];
    const human = messages[1].content;
    expect(human).toContain('文档标题：架构设计');
    expect(human).toContain('章节路径：第二章 > 存储');
    expect(human).toContain('片段序号：第 5 段');
    expect(human).toContain('相邻上文（节选）：上文片段');
    expect(human).toContain('相邻下文（节选）：下文片段');
    expect(human).toContain('正文：\n内容');
  });

  it('exposes the prompt version constant for task attribution (G1)', () => {
    expect(GRAPH_EXTRACTION_PROMPT_VERSION).toBeGreaterThan(0);
  });
});
