import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootPage } from './root-page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootPage />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
