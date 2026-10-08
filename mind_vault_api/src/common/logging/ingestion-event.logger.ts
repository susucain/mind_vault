import { Logger } from '@nestjs/common';

/**
 * 摄取链路关键事件（§10.2）：投递、消费、阶段切换、取消、重投。
 * 现状是自由文本日志，无法按 key 聚合；这里把事件名与字段固化下来。
 */
export const IngestionEvent = {
  /** 消息投递到 MQ */
  Published: 'ingestion.published',
  /** 未消费任务被 stale 扫描重投（U7） */
  Republished: 'ingestion.republished',
  /** worker 开始消费某个任务 */
  ConsumeStarted: 'ingestion.consume_started',
  /** 阶段切换 */
  StageChanged: 'ingestion.stage_changed',
  /** 用户取消上传 */
  Cancelled: 'ingestion.cancelled',
} as const;

export type IngestionEventName =
  (typeof IngestionEvent)[keyof typeof IngestionEvent];

/** 固定 key：jobId / documentId / ownerId 三个都能定位到具体任务 */
export interface IngestionEventFields {
  jobId?: string;
  documentId?: string;
  ownerId?: string;
  stage?: string;
  status?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * 关键事件单行 JSON 日志：`{"event":"ingestion.stage_changed","jobId":"...",...}`。
 * 保持与 Nest Logger 一致（同一 logger），只是把消息体换成结构化 JSON 便于聚合。
 */
export function logIngestionEvent(
  logger: Logger,
  event: IngestionEventName,
  fields: IngestionEventFields = {},
): void {
  logger.log(JSON.stringify({ event, ...fields }));
}
