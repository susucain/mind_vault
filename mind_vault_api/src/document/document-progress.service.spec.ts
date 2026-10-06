import { firstValueFrom, timeout } from 'rxjs';
import { DocumentProgressService } from './document-progress.service';

describe('DocumentProgressService', () => {
  it('forwards a progress event only to the matching owner and document stream', async () => {
    const service = new DocumentProgressService({} as never);
    const received = firstValueFrom(
      service.stream('user_1', 'doc_1').pipe(timeout(100)),
    );
    (service as never).streams.set(
      'user_1:doc_1',
      (service as never).streams.get('user_1:doc_1'),
    );
    (service as never).streams.get('user_1:doc_1').next({
      ownerId: 'user_1',
      documentId: 'doc_1',
      stage: 'embedding',
      status: 'EMBEDDING',
      completed: 2,
      total: 10,
      percent: 20,
    });

    await expect(received).resolves.toMatchObject({
      documentId: 'doc_1',
      completed: 2,
    });
  });
});
