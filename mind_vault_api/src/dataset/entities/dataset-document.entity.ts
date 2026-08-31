import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../common/transformers/bigint.transformer';

@Entity('kh_dataset_document')
export class DatasetDocumentEntity {
  @PrimaryColumn({
    name: 'dataset_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  datasetId: string;

  @PrimaryColumn({
    name: 'document_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  documentId: string;

  @Column({ name: 'owner_id', type: 'bigint', transformer: bigintTransformer })
  ownerId: string;
}
