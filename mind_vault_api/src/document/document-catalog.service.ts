import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentEntity } from './entities/document.entity';
import {
  DocumentContent,
  DocumentContentDocument,
} from './schemas/document-content.schema';

@Injectable()
export class DocumentCatalogService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectModel(DocumentContent.name)
    private readonly contents: Model<DocumentContentDocument>,
  ) {}

  async findAll(ownerId: string, query: QueryDocumentDto) {
    const qb = this.documents
      .createQueryBuilder('doc')
      .where('doc.owner_id = :ownerId', { ownerId })
      .andWhere('doc.deleted = false');
    if (query.datasetId) {
      qb.innerJoin(
        'kh_dataset_document',
        'datasetDocument',
        'datasetDocument.document_id = doc.id AND datasetDocument.owner_id = :ownerId',
        { ownerId },
      ).andWhere('datasetDocument.dataset_id = :datasetId', {
        datasetId: query.datasetId,
      });
    }
    if (query.title) {
      qb.andWhere('doc.title ILIKE :title', { title: `%${query.title}%` });
    }
    qb.orderBy('doc.created_at', 'DESC')
      .skip(((query.page ?? 1) - 1) * (query.pageSize ?? 20))
      .take(query.pageSize ?? 20);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  async findOne(ownerId: string, id: string) {
    const document = await this.documents.findOne({
      where: { id, ownerId, deleted: false },
    });
    if (!document) throw new NotFoundException(`Document ${id} not found`);
    const content = await this.contents
      .findOne({ documentId: id, deleted: false })
      .lean();
    return {
      ...document,
      content: content?.content ?? '',
      sections: content?.sections ?? [],
      pageCount: content?.pageCount ?? 0,
    };
  }
}
