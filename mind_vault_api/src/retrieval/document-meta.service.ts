import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DatasetDocumentEntity } from '../dataset/entities/dataset-document.entity';
import { DatasetEntity } from '../dataset/entities/dataset.entity';
import { DocumentEntity } from '../document/entities/document.entity';
import { RetrievalHit } from './retrieval-hit';

export interface EnrichedRetrievalHit extends RetrievalHit {
  documentTitle: string;
  datasetNames: string[];
}

/**
 * 检索结果展示字段补全：批量查询文档标题与资料集名，避免逐条查询（N+1）。
 * ES 索引里只有 id，标题与资料集名需回 PostgreSQL 取。
 */
@Injectable()
export class DocumentMetaService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(DatasetDocumentEntity)
    private readonly datasetDocuments: Repository<DatasetDocumentEntity>,
    @InjectRepository(DatasetEntity)
    private readonly datasets: Repository<DatasetEntity>,
  ) {}

  /**
   * 批量解析文档标题。引用卡片、消息列表这类只需要「id → 标题」映射的场景直接用它，
   * 不必先构造完整的检索命中对象。文档已删除时该 id 不出现在结果里，调用方按无标题处理。
   */
  async titlesOf(
    ownerId: string,
    documentIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(documentIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const documents = await this.documents.find({
      where: { id: In(ids), ownerId },
      select: { id: true, title: true },
    });
    return new Map(documents.map((document) => [document.id, document.title]));
  }

  async enrich(
    ownerId: string,
    hits: RetrievalHit[],
  ): Promise<EnrichedRetrievalHit[]> {
    if (hits.length === 0) return [];
    const documentIds = [
      ...new Set(hits.map((hit) => hit.documentId).filter(Boolean)),
    ];
    const [titles, links] = await Promise.all([
      this.titlesOf(ownerId, documentIds),
      documentIds.length
        ? this.datasetDocuments.find({
            where: { documentId: In(documentIds), ownerId },
          })
        : Promise.resolve([] as DatasetDocumentEntity[]),
    ]);

    const datasetIdsByDocument = new Map<string, string[]>();
    for (const link of links) {
      const list = datasetIdsByDocument.get(link.documentId) ?? [];
      list.push(link.datasetId);
      datasetIdsByDocument.set(link.documentId, list);
    }

    const datasetIds = [
      ...new Set([
        ...links.map((link) => link.datasetId),
        ...hits.flatMap((hit) => hit.datasetIds),
      ]),
    ];
    const datasets = datasetIds.length
      ? await this.datasets.find({
          where: { id: In(datasetIds), ownerId },
          select: { id: true, name: true },
        })
      : [];
    const datasetNames = new Map(datasets.map((item) => [item.id, item.name]));

    return hits.map((hit) => {
      // 文档归属的资料集是权威来源；文档不在任何资料集时回退到索引里的字段
      const ids = datasetIdsByDocument.get(hit.documentId) ?? hit.datasetIds;
      return {
        ...hit,
        documentTitle: titles.get(hit.documentId) ?? '',
        datasetIds: ids,
        datasetNames: ids
          .map((id) => datasetNames.get(id))
          .filter((name): name is string => Boolean(name)),
      };
    });
  }
}
