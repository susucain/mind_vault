import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './layouts';
import { ChatPage, PlaceholderPage } from './pages';
import { APP_PATHS } from './navigation';
import { LoginPage } from '../pages/auth/LoginPage';
import { OverviewPage } from '../pages/overview/OverviewPage';
import { LibraryPage } from '../pages/library/LibraryPage';
import { DatasetsPage } from '../pages/library/DatasetsPage';
import { DocumentDetailPage } from '../pages/library/DocumentDetailPage';
import { DocumentPreviewPage } from '../pages/library/DocumentPreviewPage';
import { MockLibraryPage } from '../pages/library/MockLibraryPage';
import { ArchivePage } from '../pages/library/ArchivePage';
import { InterviewPage } from '../pages/interview/InterviewPage';
import { NewInterviewPage } from '../pages/interview/NewInterviewPage';
import { InterviewSessionPage } from '../pages/interview/InterviewSessionPage';
import { InterviewFeedbackPage } from '../pages/interview/InterviewFeedbackPage';
import { ReviewItemsPage } from '../pages/interview/ReviewItemsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate replace to={APP_PATHS.overview} />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/app',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate replace to={APP_PATHS.overview} /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'library/documents', element: <LibraryPage /> },
      { path: 'library/datasets', element: <DatasetsPage /> },
      { path: 'library/datasets/:datasetId', element: <DatasetsPage /> },
      { path: 'library/folders', element: <MockLibraryPage kind="folders" /> },
      { path: 'library/tags', element: <MockLibraryPage kind="tags" /> },
      { path: 'library/archive', element: <ArchivePage /> },
      { path: 'library/documents/:documentId', element: <DocumentDetailPage /> },
      { path: 'library/documents/:documentId/preview', element: <DocumentPreviewPage /> },
      { path: 'chat', element: <ChatPage isNew /> },
      { path: 'chat/new', element: <ChatPage isNew /> },
      { path: 'chat/:conversationId', element: <ChatPage /> },
      { path: 'interview', element: <InterviewPage /> },
      { path: 'interview/new', element: <NewInterviewPage /> },
      { path: 'interview/sessions', element: <InterviewPage /> },
      { path: 'interview/sessions/:sessionId', element: <InterviewSessionPage /> },
      { path: 'interview/sessions/:sessionId/feedback', element: <InterviewFeedbackPage /> },
      { path: 'interview/review-items', element: <ReviewItemsPage /> },
      { path: 'interview/review-items/:itemId', element: <ReviewItemsPage /> },
      { path: 'settings/*', element: <PlaceholderPage title="Settings" /> },
    ],
  },
  {
    path: '*',
    element: <Navigate replace to={APP_PATHS.overview} />,
  },
]);
