import { HealthResponse } from '../types/api';
import { request } from './request';

export function getHealth() {
  return request<HealthResponse>({
    path: '/health',
    skipAuth: true,
  });
}
