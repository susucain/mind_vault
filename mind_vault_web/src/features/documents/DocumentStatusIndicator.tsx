import type { DocumentStatus } from '../../types/domain';
import { documentStatusPresentation } from './document-utils';

export function DocumentStatusIndicator({ status }: { status: DocumentStatus | 'queued' }) {
  const resolvedStatus: DocumentStatus = status === 'queued' ? 'pending' : status;
  const presentation = documentStatusPresentation[resolvedStatus];
  const Icon = presentation.icon;

  return (
    <span className={`document-status document-status--${presentation.tone}`} data-status-tone={presentation.tone}>
      <Icon aria-label={presentation.label} data-testid="document-status-icon" size={16} />
      <span>{presentation.label}</span>
    </span>
  );
}
