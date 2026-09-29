import { useParams } from 'react-router-dom';
import { EmptyState, StatusBadge } from '../components/ui';

const pageDescriptions: Record<string, string> = {
  Overview: 'Your workspace overview will be available here.',
  Library: 'Browse datasets and documents from one library.',
  Datasets: 'Manage the datasets available to conversations and interviews.',
  Chat: 'Start a new knowledge-grounded conversation.',
  Interview: 'Prepare and review interview practice sessions.',
  'New interview': 'Choose a dataset and configure a practice session.',
  'Review items': 'Review the concepts scheduled for your next practice.',
  Settings: 'Configure your Mind Vault workspace.',
};

export function PlaceholderPage({ title }: { title: keyof typeof pageDescriptions }) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Mind Vault</p>
          <h1>{title}</h1>
        </div>
        <StatusBadge>Coming soon</StatusBadge>
      </div>
      <EmptyState description={pageDescriptions[title]} title={`${title} is not available yet`} />
    </section>
  );
}

export function DocumentPage({ preview = false }: { preview?: boolean }) {
  const { documentId } = useParams();
  const title = preview ? 'Document preview' : 'Document';
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h1>{title}</h1>
        </div>
        <StatusBadge>{documentId ?? 'Unknown document'}</StatusBadge>
      </div>
      <EmptyState
        description={preview ? 'A readable source preview will appear here.' : 'Document details and processing status will appear here.'}
        title={`${title} is not available yet`}
      />
    </section>
  );
}

export function ConversationPage({ isNew = false }: { isNew?: boolean }) {
  const { conversationId } = useParams();
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Chat</p>
          <h1>{isNew ? 'New conversation' : 'Conversation'}</h1>
        </div>
        {!isNew ? <StatusBadge>{conversationId ?? 'Unknown conversation'}</StatusBadge> : null}
      </div>
      <EmptyState description="The conversation workspace will be available here." title="Chat is not available yet" />
    </section>
  );
}

export function InterviewSessionPage({ feedback = false }: { feedback?: boolean }) {
  const { sessionId } = useParams();
  const title = feedback ? 'Session feedback' : 'Interview session';
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Interview</p>
          <h1>{title}</h1>
        </div>
        <StatusBadge>{sessionId ?? 'Unknown session'}</StatusBadge>
      </div>
      <EmptyState description="This interview session workspace will be available here." title={`${title} is not available yet`} />
    </section>
  );
}
