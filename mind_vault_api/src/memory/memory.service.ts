import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { EmbeddingService } from '../embedding/embedding.service';
import { LangfuseService } from '../observability/langfuse.service';
import { MEMORY_PAGE_SIZE_DEFAULT } from './dto/list-memories.dto';
import { UserMemoryEntity } from './entities/user-memory.entity';
import { MemoryModelService } from './memory-model.service';
import {
  ExplicitMemoryResult,
  MemoryItem,
  MemoryNote,
  memoryConfig,
} from './memory.types';
import type { MemoryKind, MemoryStatus } from './memory.types';

interface MemoryRow {
  id: string;
  content: string;
  kind: MemoryKind;
  score: number;
}

export interface MemoryListQuery {
  status?: MemoryStatus;
  kind?: MemoryKind;
  q?: string;
  page?: number;
  pageSize?: number;
}

interface MemoryStatsRow {
  status: MemoryStatus;
  kind: MemoryKind;
  count: number;
  hits: number;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(UserMemoryEntity)
    private readonly memories: Repository<UserMemoryEntity>,
    private readonly embedding: EmbeddingService,
    private readonly model: MemoryModelService,
    private readonly langfuse: LangfuseService,
  ) {}

  /**
   * 写入一条记忆。写库前先查最相近的一条：
   * - 达到重复阈值：说明是同一事实的另一种说法，更新原条目而不是新增，避免记忆条目膨胀；
   * - 达到相关阈值：说明是同主题的新说法（例如偏好从 Go 变成 Java），新条目生效，旧条目标记 SUPERSEDED。
   */
  async create(
    ownerId: string,
    input: {
      content: string;
      kind?: MemoryKind;
      sourceConversationId?: string;
    },
  ) {
    const content = input.content.trim();
    const kind = input.kind ?? 'fact';
    const vector = await this.embedding.embedQuery(content);
    const [nearest] = await this.nearest(ownerId, vector, 1);
    if (nearest && nearest.score >= memoryConfig.minDuplicateScore) {
      await this.memories.update(
        { id: nearest.id, ownerId },
        { content, kind },
      );
      return this.memories.findOneByOrFail({ id: nearest.id, ownerId });
    }
    if (nearest && nearest.score >= memoryConfig.minRelatedScore) {
      // 保留旧条目以便回溯，只是不再参与召回
      await this.memories.update(
        { id: nearest.id, ownerId },
        { status: 'SUPERSEDED' },
      );
    }
    const id = nextSnowflakeId();
    // 向量列只能用原生 SQL 写入，显式 ::vector 转换避免参数类型推断问题
    await this.memories.query(
      `INSERT INTO kh_user_memory
         (id, owner_id, content, kind, source_conversation_id, status, embedding)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6::vector)`,
      [
        id,
        ownerId,
        content,
        kind,
        input.sourceConversationId ?? null,
        vectorLiteral(vector),
      ],
    );
    return this.memories.findOneByOrFail({ id, ownerId });
  }

  /**
   * 自动抽取：输入是刚滑出短期记忆窗口的对话轮次（含助手回答）。
   * 抽出的候选先过入库过滤（资料派生内容、超长条目一律丢弃），
   * 再逐条走与显式写入相同的去重/取代逻辑，最后做一次上限淘汰。
   * 返回实际写入条数，异常向上抛给调用方决定降级。
   */
  async extractFromTurns(input: {
    ownerId: string;
    conversationId: string;
    turns: { role: string; content: string }[];
  }): Promise<number> {
    return this.langfuse.trace(
      {
        name: 'memory.extract',
        userId: input.ownerId,
        sessionId: input.conversationId,
        tags: ['memory', 'extract'],
        input: { turns: input.turns.length },
        output: (saved) => ({ saved }),
      },
      () => this.runExtraction(input),
    );
  }

  private async runExtraction(input: {
    ownerId: string;
    conversationId: string;
    turns: { role: string; content: string }[];
  }): Promise<number> {
    if (input.turns.length === 0) return 0;
    const candidates = await this.model.extract(input.turns);
    let saved = 0;
    for (const candidate of candidates) {
      if (candidate.content.length > memoryConfig.maxContentChars) continue;
      if (isDocumentDerived(candidate.content)) continue;
      await this.create(input.ownerId, {
        content: candidate.content,
        kind: candidate.kind,
        sourceConversationId: input.conversationId,
      });
      saved += 1;
    }
    // 候选与写入的落差反映提示词与入库过滤的拦截强度
    this.logger.log(
      `长期记忆抽取: 候选 ${candidates.length} 条, 写入 ${saved} 条, 会话 ${input.conversationId}`,
    );
    if (saved > 0) await this.evict(input.ownerId);
    return saved;
  }

  async handleExplicit(input: {
    ownerId: string;
    conversationId: string;
    question: string;
    summary?: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    signal?: AbortSignal;
  }): Promise<ExplicitMemoryResult> {
    return this.langfuse.trace(
      {
        name: 'memory.explicit',
        userId: input.ownerId,
        sessionId: input.conversationId,
        tags: ['memory', 'explicit'],
        input: { question: input.question },
        output: (result) => ({ action: result.action }),
      },
      () => this.runExplicit(input),
    );
  }

  private async runExplicit(input: {
    ownerId: string;
    conversationId: string;
    question: string;
    summary?: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    signal?: AbortSignal;
  }): Promise<ExplicitMemoryResult> {
    const intent = explicitIntent(input.question);
    if (intent === 'none') return { action: 'none' };
    if (intent === 'decline') {
      return {
        action: 'not_saved',
        answer: '好的，这次不会把这条信息保存为长期记忆。',
      };
    }

    if (intent === 'save') {
      const extracted = await this.model.extractExplicit(
        {
          question: input.question,
          summary: input.summary,
          history: input.history,
        },
        { signal: input.signal },
      );
      if (!extracted.content) {
        return {
          action: 'clarification_required',
          answer: '你的年龄是多少？告诉我后我再帮你记住。',
        };
      }
      await this.create(input.ownerId, {
        content: extracted.content,
        kind: extracted.kind,
        sourceConversationId: input.conversationId,
      });
      this.logger.log(
        `显式长期记忆已保存: owner=${input.ownerId} conversation=${input.conversationId}`,
      );
      return { action: 'saved', content: extracted.content };
    }

    const memories = await this.recallMemories(
      input.ownerId,
      memoryQuery(input.question),
    );
    if (intent === 'query') {
      return {
        action: 'queried',
        memories: memories.map((memory) => ({
          id: memory.id,
          content: memory.content,
          kind: memory.kind,
        })),
        answer:
          memories.length > 0
            ? `我记得：${memories.map((memory) => memory.content).join('；')}`
            : '我还没有记住与这件事相关的信息。',
      };
    }
    if (memories.length === 0) {
      return {
        action: 'forgotten',
        answer: '我没有找到与这件事相关的长期记忆。',
      };
    }
    await this.remove(input.ownerId, memories[0].id);
    return {
      action: 'forgotten',
      content: memories[0].content,
      answer: `已忘记：${memories[0].content}`,
    };
  }

  /**
   * 记忆列表。page/pageSize 都不传时返回全量——小程序在两个状态间按
   * items.length 算条数与满仓状态，一旦默认分页，它的计数会直接失真。
   */
  async list(ownerId: string, query: MemoryListQuery = {}) {
    const status = query.status ?? 'ACTIVE';
    const where: FindOptionsWhere<UserMemoryEntity> = { ownerId, status };
    if (query.kind) where.kind = query.kind;
    if (query.q) where.content = ILike(`%${escapeLikePattern(query.q)}%`);
    // 批次写入的记忆 updatedAt 常常同秒，补 id 排序才能让分页不重不漏
    const order = { updatedAt: 'DESC' as const, id: 'DESC' as const };

    if (query.page === undefined && query.pageSize === undefined) {
      const items = await this.memories.find({ where, order });
      return { items, total: items.length, page: 1, pageSize: null };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? MEMORY_PAGE_SIZE_DEFAULT;
    const [items, total] = await Promise.all([
      this.memories.find({
        where,
        order,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.memories.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * 记忆概览：按状态与类型聚合，供设置页展示条数、类型分布与容量水位。
   * byKind 只统计生效中的条目，与 active 求和一致，避免前端两个数对不上。
   */
  async stats(ownerId: string) {
    const result: unknown = await this.memories.query(
      `SELECT status, kind, COUNT(*)::int AS count, COALESCE(SUM(hit_count), 0)::int AS hits
         FROM kh_user_memory
        WHERE owner_id = $1
        GROUP BY status, kind`,
      [ownerId],
    );
    const rows = result as MemoryStatsRow[];
    const byKind: Record<MemoryKind, number> = {
      preference: 0,
      fact: 0,
      goal: 0,
    };
    let active = 0;
    let superseded = 0;
    let hitTotal = 0;
    for (const row of rows) {
      const count = Number(row.count);
      hitTotal += Number(row.hits);
      if (row.status === 'ACTIVE') {
        active += count;
        byKind[row.kind] = (byKind[row.kind] ?? 0) + count;
      } else {
        superseded += count;
      }
    }
    return {
      active,
      superseded,
      total: active + superseded,
      byKind,
      hitTotal,
      maxActive: memoryConfig.maxActivePerUser,
      atCapacity: active >= memoryConfig.maxActivePerUser,
    };
  }

  /**
   * 修改一条记忆。改内容必须重算向量：向量列没映射到实体，
   * 只改 content 会让召回仍按旧语义匹配，等于改了个看不见的字段。
   */
  async update(
    ownerId: string,
    id: string,
    patch: { content?: string; kind?: MemoryKind; status?: MemoryStatus },
  ) {
    if (
      patch.content === undefined &&
      patch.kind === undefined &&
      patch.status === undefined
    ) {
      throw new BadRequestException('至少需要一个待更新字段');
    }
    const existing = await this.memories.findOneBy({ id, ownerId });
    if (!existing) throw new NotFoundException('记忆不存在');
    if (patch.content !== undefined) {
      const vector = await this.embedding.embedQuery(patch.content.trim());
      await this.memories.query(
        `UPDATE kh_user_memory
            SET embedding = $3::vector
          WHERE owner_id = $1 AND id = $2`,
        [ownerId, id, vectorLiteral(vector)],
      );
    }
    await this.memories.update(
      { id, ownerId },
      {
        ...(patch.content === undefined
          ? {}
          : { content: patch.content.trim() }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    );
    return this.memories.findOneByOrFail({ id, ownerId });
  }

  /** 一键清空：物理删除该用户的全部记忆，含已被取代的历史条目 */
  async clear(ownerId: string) {
    const result = await this.memories.delete({ ownerId });
    const deleted = result.affected ?? 0;
    this.logger.log(`长期记忆清空: owner=${ownerId} 删除 ${deleted} 条`);
    return { deleted };
  }

  /** 用户主动忘记：直接物理删除，不留副本 */
  async remove(ownerId: string, id: string) {
    const result = await this.memories.delete({ id, ownerId });
    if (!result.affected) throw new NotFoundException('记忆不存在');
    this.logger.log(`长期记忆删除: owner=${ownerId} id=${id}`);
    return { id, deleted: true };
  }

  /**
   * 召回与问题相关的记忆。embedding 或数据库异常向上抛，
   * 由调用方（rag-agent 的 recall 节点）决定降级，这里不吞掉。
   */
  async recallMemories(ownerId: string, query: string): Promise<MemoryItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const vector = await this.embedding.embedQuery(trimmed);
    const rows = await this.nearest(
      ownerId,
      vector,
      memoryConfig.recallTopK * 2,
    );
    const kept = rows
      .filter((row) => row.score >= memoryConfig.minRecallScore)
      .slice(0, memoryConfig.recallTopK);
    // 一行一指标：候选数反映记忆总量，注入数反映命中，top 分反映阈值是否卡得太紧
    this.logger.log(
      `长期记忆召回: 候选 ${rows.length} 条, 注入 ${kept.length} 条, top ${
        kept[0] ? kept[0].score.toFixed(3) : '-'
      }`,
    );
    if (kept.length === 0) return [];
    await this.touch(
      ownerId,
      kept.map((row) => row.id),
    );
    return kept;
  }

  /**
   * 按类型取用记忆，不做向量召回。
   * 场景不同：问答是"这句问题相关吗"，而面试提问关心的是"这个人稳定表达过的偏好与目标"，
   * 与某句问题是否相似无关，所以直接按类型取最近更新的若干条，省掉一次 embedding 调用。
   */
  async recallByKinds(
    ownerId: string,
    kinds: MemoryKind[],
    limit = memoryConfig.recallTopK,
  ): Promise<MemoryNote[]> {
    const rows = await this.memories.find({
      where: { ownerId, status: 'ACTIVE', kind: In(kinds) },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    if (rows.length === 0) return [];
    await this.touch(
      ownerId,
      rows.map((row) => row.id),
    );
    this.logger.log(
      `长期记忆按类型取用: 类型 ${kinds.join('/')} 注入 ${rows.length} 条`,
    );
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      kind: row.kind,
    }));
  }

  /**
   * 按余弦距离取最近邻：1 - 距离 即余弦相似度，与资料检索的阈值口径一致。
   */
  private async nearest(
    ownerId: string,
    vector: number[],
    limit: number,
  ): Promise<MemoryItem[]> {
    // Repository.query 返回 any，先收敛为 unknown 再断言，避免不安全赋值扩散
    const result: unknown = await this.memories.query(
      `SELECT id, content, kind, 1 - (embedding <=> $1::vector) AS score
         FROM kh_user_memory
        WHERE owner_id = $2 AND status = 'ACTIVE' AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [vectorLiteral(vector), ownerId, limit],
    );
    const rows = result as MemoryRow[];
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      kind: row.kind,
      score: Number(row.score),
    }));
  }

  /** 命中统计，供后续按 (last_used_at, hit_count) 淘汰冷门记忆 */
  private async touch(ownerId: string, ids: string[]) {
    await this.memories.query(
      `UPDATE kh_user_memory
          SET hit_count = hit_count + 1, last_used_at = NOW()
        WHERE owner_id = $1 AND id = ANY($2::varchar[])`,
      [ownerId, ids],
    );
  }

  /**
   * 上限淘汰：只在自动抽取之后执行，用户显式写入的条目不会被挤掉。
   * 标记为 SUPERSEDED 而不是物理删除，保留可回溯。
   */
  private async evict(ownerId: string) {
    const total = await this.memories.count({
      where: { ownerId, status: 'ACTIVE' },
    });
    const excess = total - memoryConfig.maxActivePerUser;
    if (excess <= 0) return;
    await this.memories.query(
      `UPDATE kh_user_memory
          SET status = 'SUPERSEDED', updated_at = NOW()
        WHERE id IN (
          SELECT id FROM kh_user_memory
           WHERE owner_id = $1 AND status = 'ACTIVE'
           ORDER BY last_used_at ASC NULLS FIRST, hit_count ASC, updated_at ASC
           LIMIT $2
        )`,
      [ownerId, excess],
    );
    this.logger.log(
      `长期记忆淘汰: owner=${ownerId} 冷门 ${excess} 条转为已失效`,
    );
  }
}

/** pgvector 的文本输入格式，避免为写入向量引入额外依赖 */
function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * LIKE 通配符转义。参数化查询已经防了注入，这里只处理语义：
 * 用户搜 `100%` 或 `a_b` 时应当按字面量匹配，而不是变成任意匹配。
 * 转义符用反斜杠，与 Postgres LIKE 的默认约定一致。
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * 入库过滤：命中这些特征的条目视为资料派生内容。
 * 提示词已经做了约束，这里是兜底——资料结论一旦进记忆，
 * 文档更新后它会变成一份不会失效的旧结论，比少记一条更难收拾。
 */
const documentDerivedPatterns = [
  /根据资料/,
  /资料中(?:提到|写明|指出|说明)/,
  /文档中/,
  /参见/,
  /页码/,
  /chunk/i,
  /document/i,
];

function isDocumentDerived(content: string): boolean {
  return documentDerivedPatterns.some((pattern) => pattern.test(content));
}

type ExplicitIntent = 'none' | 'save' | 'forget' | 'query' | 'decline';

function explicitIntent(question: string): ExplicitIntent {
  const text = question.trim();
  if (!text) return 'none';
  if (/你还记得|记得我之前|我之前说过|长期记忆里/.test(text)) {
    return 'query';
  }
  if (/不要记住|别记住|不要保存|别保存/.test(text)) {
    return 'decline';
  }
  if (/不要记住|别记住|忘记|忘掉|删除.*记忆/.test(text)) {
    return 'forget';
  }
  if (/记住|记下来|以后记得|帮我保存|长期保存|保存.*记忆/.test(text)) {
    return 'save';
  }
  return 'none';
}

function memoryQuery(question: string): string {
  const query = question
    .replace(
      /你还记得|记得我之前|我之前说过|长期记忆里|忘记|忘掉|删除|记住|记下来|吗|么|[?？]/g,
      '',
    )
    .trim();
  return query || question.trim();
}
