import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoadingState } from '../components/ui';
import { ProtectedLayout } from './layouts';
import { ChatPage } from './pages';
import { APP_PATHS } from './navigation';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { OverviewPage } from '../pages/overview/OverviewPage';
import { LibraryPage } from '../pages/library/LibraryPage';
import { DatasetsPage } from '../pages/library/DatasetsPage';
import { DocumentDetailPage } from '../pages/library/DocumentDetailPage';
import { DocumentPreviewPage } from '../pages/library/DocumentPreviewPage';
import { MockLibraryPage } from '../pages/library/MockLibraryPage';
import { ArchivePage } from '../pages/library/ArchivePage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { AccountSection } from '../pages/settings/sections/AccountSection';
import { MemorySection } from '../pages/settings/sections/MemorySection';
import { SecuritySection } from '../pages/settings/sections/SecuritySection';

/** 重页面按路由懒加载：检索页含 React Flow 与 d3-force，面试页含 SSE 与评分视图。 */
// eslint-disable-next-line react-refresh/only-export-components
const RetrievalPage = lazy(() =>
  import('../pages/retrieval/RetrievalPage').then((module) => ({ default: module.RetrievalPage })),
);
/* eslint-disable react-refresh/only-export-components */
const InterviewPage = lazy(() =>
  import('../pages/interview/InterviewPage').then((module) => ({ default: module.InterviewPage })),
);
const NewInterviewPage = lazy(() =>
  import('../pages/interview/NewInterviewPage').then((module) => ({ default: module.NewInterviewPage })),
);
const InterviewSessionPage = lazy(() =>
  import('../pages/interview/InterviewSessionPage').then((module) => ({ default: module.InterviewSessionPage })),
);
const InterviewFeedbackPage = lazy(() =>
  import('../pages/interview/InterviewFeedbackPage').then((module) => ({ default: module.InterviewFeedbackPage })),
);
const ReviewItemsPage = lazy(() =>
  import('../pages/interview/ReviewItemsPage').then((module) => ({ default: module.ReviewItemsPage })),
);
/* eslint-enable react-refresh/only-export-components */

/** 懒加载路由统一包裹 Suspense，加载期间展示中性占位。 */
function lazyPage(element: ReactNode, label: string) {
  return <Suspense fallback={<LoadingState label={label} />}>{element}</Suspense>;
}

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
    path: '/register',
    element: <RegisterPage />,
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
      {
        path: 'retrieval',
        element: (
          <Suspense fallback={<LoadingState label="正在加载检索页…" />}>
            <RetrievalPage />
          </Suspense>
        ),
      },
      { path: 'chat', element: <ChatPage isNew /> },
      { path: 'chat/new', element: <ChatPage isNew /> },
      { path: 'chat/:conversationId', element: <ChatPage /> },
      { path: 'interview', element: lazyPage(<InterviewPage />, '正在加载训练首页…') },
      { path: 'interview/new', element: lazyPage(<NewInterviewPage />, '正在加载训练配置…') },
      { path: 'interview/sessions', element: lazyPage(<InterviewPage />, '正在加载训练首页…') },
      { path: 'interview/sessions/:sessionId', element: lazyPage(<InterviewSessionPage />, '正在加载训练会话…') },
      { path: 'interview/sessions/:sessionId/feedback', element: lazyPage(<InterviewFeedbackPage />, '正在加载训练反馈…') },
      { path: 'interview/review-items', element: lazyPage(<ReviewItemsPage />, '正在加载复习中心…') },
      { path: 'interview/review-items/:itemId', element: lazyPage(<ReviewItemsPage />, '正在加载复习中心…') },
      {
        path: 'settings',
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate replace to={APP_PATHS.settingsAccount} /> },
          { path: 'account', element: <AccountSection /> },
          { path: 'memory', element: <MemorySection /> },
          { path: 'security', element: <SecuritySection /> },
          { path: '*', element: <Navigate replace to={APP_PATHS.settingsAccount} /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate replace to={APP_PATHS.overview} />,
  },
]);
