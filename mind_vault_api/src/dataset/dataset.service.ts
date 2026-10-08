import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { QueryDatasetDto } from './dto/query-dataset.dto';
import { DatasetDocumentEntity } from './entities/dataset-document.entity';
import { DatasetEntity } from './entities/dataset.entity';

@Injectable()
export class DatasetService {
  constructor(
    @InjectRepository(DatasetEntity)
    private readonly repository: Repository<DatasetEntity>,
    @InjectRepository(DatasetDocumentEntity)
    private readonly datasetDocuments: Repository<DatasetDocumentEntity>,
  ) {}

  async create(ownerId: string, dto: CreateDatasetDto) {
    const dataset = this.repository.create({
      id: nextSnowflakeId(),
      ownerId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      deleted: false,
    });
    return this.repository.save(dataset);
  }

  async findAll(ownerId: string, query: QueryDatasetDto) {
    const qb = this.repository.createQueryBuilder('dataset');
    qb.where('dataset.owner_id = :ownerId', { ownerId }).andWhere(
      'dataset.deleted = false',
    );
    if (query.name) {
      qb.andWhere('dataset.name ILIKE :name', { name: `%${query.name}%` });
    }
    qb.orderBy('dataset.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    const counts = await this.countDocuments(
      ownerId,
      items.map((item) => item.id),
    );
    return {
      items: items.map((item) => ({
        ...item,
        documentCount: counts.get(item.id) ?? 0,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * 按资料集聚合未删除的文档数。
   *
   * 文档删除只置 `kh_document.deleted`、不清理 `kh_dataset_document` 关系行，
   * 因此必须 join 文档表按 `deleted = false` 过滤，否则会把已删除文档也算进去。
   */
  private async countDocuments(ownerId: string, datasetIds: string[]) {
    const counts = new Map<string, number>();
    if (!datasetIds.length) return counts;
    const rows = await this.datasetDocuments
      .createQueryBuilder('relation')
      .innerJoin(
        'kh_document',
        'document',
        'document.id = relation.document_id AND document.owner_id = relation.owner_id',
      )
      .select('relation.dataset_id', 'datasetId')
      .addSelect('COUNT(*)', 'count')
      .where('relation.owner_id = :ownerId', { ownerId })
      .andWhere('relation.dataset_id IN (:...datasetIds)', { datasetIds })
      .andWhere('document.deleted = false')
      .groupBy('relation.dataset_id')
      .getRawMany<{ datasetId: string; count: string }>();
    for (const row of rows) {
      counts.set(String(row.datasetId), Number(row.count));
    }
    return counts;
  }

  async findOne(ownerId: string, id: string) {
    const dataset = await this.repository.findOne({
      where: { id, ownerId, deleted: false },
    });
    if (!dataset) throw new NotFoundException(`Dataset ${id} not found`);
    return dataset;
  }

  async update(ownerId: string, id: string, dto: CreateDatasetDto) {
    const dataset = await this.findOne(ownerId, id);
    dataset.name = dto.name.trim();
    dataset.description = dto.description?.trim() || null;
    return this.repository.save(dataset);
  }

  async remove(ownerId: string, id: string) {
    const dataset = await this.findOne(ownerId, id);
    dataset.deleted = true;
    await this.repository.save(dataset);
    return { id, deleted: true };
  }
}
