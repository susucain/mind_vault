import { appConfig } from '../lib/config';
import { ApiRequestError } from '../lib/errors';

export interface ExportJob {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
}

function unavailable(): never {
  throw new ApiRequestError({
    status: 501,
    code: 'NOT_IMPLEMENTED',
    message: 'Export API is not implemented by the backend.',
  });
}

export async function createExport(): Promise<ExportJob> {
  if (!appConfig.enableMockApi) return unavailable();
  return { id: `mock-export-${Date.now()}`, status: 'ready' };
}
