import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage, ProtectedLayout } from './layouts';
import {
  ConversationPage,
  DocumentPage,
  InterviewSessionPage,
  PlaceholderPage,
} from './pages';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate replace to="/app/overview" />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/app',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate replace to="overview" /> },
      { path: 'overview', element: <PlaceholderPage title="Overview" /> },
      { path: 'library', element: <PlaceholderPage title="Library" /> },
      { path: 'library/documents', element: <PlaceholderPage title="Library" /> },
      { path: 'library/datasets', element: <PlaceholderPage title="Datasets" /> },
      { path: 'library/datasets/:datasetId', element: <PlaceholderPage title="Datasets" /> },
      { path: 'library/folders', element: <PlaceholderPage title="Library" /> },
      { path: 'library/tags', element: <PlaceholderPage title="Library" /> },
      { path: 'library/archive', element: <PlaceholderPage title="Library" /> },
      { path: 'library/documents/:documentId', element: <DocumentPage /> },
      { path: 'library/documents/:documentId/preview', element: <DocumentPage preview /> },
      { path: 'chat', element: <ConversationPage isNew /> },
      { path: 'chat/new', element: <ConversationPage isNew /> },
      { path: 'chat/:conversationId', element: <ConversationPage /> },
      { path: 'interview', element: <PlaceholderPage title="Interview" /> },
      { path: 'interview/new', element: <PlaceholderPage title="New interview" /> },
      { path: 'interview/sessions', element: <PlaceholderPage title="Interview" /> },
      { path: 'interview/sessions/:sessionId', element: <InterviewSessionPage /> },
      { path: 'interview/sessions/:sessionId/feedback', element: <InterviewSessionPage feedback /> },
      { path: 'interview/review-items', element: <PlaceholderPage title="Review items" /> },
      { path: 'settings/*', element: <PlaceholderPage title="Settings" /> },
    ],
  },
  {
    path: '*',
    element: <Navigate replace to="/app/overview" />,
  },
]);
