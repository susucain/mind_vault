import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmbeddingResponse {
  data?: Array<{ index: number; embedding: number[] }>;
  error?: { message?: string };
}

@Injectable()
export class EmbeddingService {
  constructor(private readonly config: ConfigService) {}

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([text]);
    return embedding;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const batchSize = Math.max(
      1,
      this.config.get<number>('EMBEDDING_BATCH_SIZE', 10),
    );
    const all: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      const response = await fetch(
        `${this.config.get<string>(
          'EMBEDDING_BASE_URL',
          'https://dashscope.aliyuncs.com/compatible-mode/v1',
        )}/embeddings`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.get<string>(
              'EMBEDDING_API_KEY',
              this.config.get<string>('DASHSCOPE_API_KEY', ''),
            )}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.get<string>(
              'EMBEDDING_MODEL',
              'qwen3.7-text-embedding',
            ),
            input: batch,
            dimensions: this.config.get<number>(
              'EMBEDDING_DIMENSIONS',
              this.config.get<number>('EMBEDDING_DIMENSION', 1024),
            ),
          }),
        },
      );
      const body = (await response.json()) as EmbeddingResponse;
      if (!response.ok || !body.data) {
        throw new BadGatewayException(
          `Embedding API 调用失败: ${body.error?.message ?? response.statusText}`,
        );
      }
      const ordered = [...body.data].sort((a, b) => a.index - b.index);
      if (ordered.length !== batch.length) {
        throw new BadGatewayException('Embedding API 返回数量与输入不一致');
      }
      all.push(...ordered.map((item) => item.embedding));
    }
    return all;
  }
}
