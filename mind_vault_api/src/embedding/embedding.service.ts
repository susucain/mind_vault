import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class EmbeddingService {
  private embeddings?: OpenAIEmbeddings;

  constructor(private readonly config: ConfigService) {}

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([text]);
    return embedding;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      return await this.model().embedDocuments(texts);
    } catch (error) {
      throw new BadGatewayException(
        `Embedding API 调用失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private model(): OpenAIEmbeddings {
    this.embeddings ??= new OpenAIEmbeddings({
      apiKey: this.config.get<string>(
        'EMBEDDING_API_KEY',
        this.config.get<string>('DASHSCOPE_API_KEY', ''),
      ),
      model: this.config.getOrThrow<string>('models.embedding'),
      configuration: {
        baseURL: this.config.get<string>(
          'EMBEDDING_BASE_URL',
          'https://dashscope.aliyuncs.com/compatible-mode/v1',
        ),
      },
      dimensions: this.config.get<number>(
        'EMBEDDING_DIMENSIONS',
        this.config.get<number>('EMBEDDING_DIMENSION', 1024),
      ),
      batchSize: Math.max(
        1,
        this.config.get<number>('EMBEDDING_BATCH_SIZE', 10),
      ),
      // LangChain 默认会把换行替换为空格，会改变向量结果，必须关闭以保持与已有索引一致
      stripNewLines: false,
    });
    return this.embeddings;
  }
}
