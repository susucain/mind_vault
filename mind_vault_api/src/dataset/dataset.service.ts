import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { QueryDatasetDto } from './dto/query-dataset.dto';
import { DatasetEntity } from './entities/dataset.entity';

@Injectable()
export class DatasetService {
  constructor(
    @InjectRepository(DatasetEntity)
    private readonly repository: Repository<DatasetEntity>,
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
    return { items, total, page: query.page, pageSize: query.pageSize };
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
