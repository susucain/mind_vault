import { Logger } from '@nestjs/common';
import { IngestionEvent, logIngestionEvent } from './ingestion-event.logger';

describe('logIngestionEvent', () => {
  it('emits a single-line JSON payload with the fixed event keys (M6/§10.2)', () => {
    const log = jest.fn();
    const logger = { log } as unknown as Logger;

    logIngestionEvent(logger, IngestionEvent.StageChanged, {
      jobId: 'job_1',
      ownerId: 'user_1',
      documentId: 'doc_1',
      stage: 'embedding',
      status: 'EMBEDDING',
      completed: 3,
      total: 10,
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '{"event":"ingestion.stage_changed","jobId":"job_1","ownerId":"user_1","documentId":"doc_1","stage":"embedding","status":"EMBEDDING","completed":3,"total":10}',
    );
  });

  it('keeps the event name when there is no extra context', () => {
    const log = jest.fn();
    const logger = { log } as unknown as Logger;

    logIngestionEvent(logger, IngestionEvent.Cancelled);

    expect(log).toHaveBeenCalledWith('{"event":"ingestion.cancelled"}');
  });
});
