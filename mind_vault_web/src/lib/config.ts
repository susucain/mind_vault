export interface AppEnv {
  VITE_API_BASE_URL?: string;
  VITE_ENABLE_MOCK_API?: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  enableMockApi: boolean;
}

export function readAppConfig(env: AppEnv = import.meta.env as AppEnv): AppConfig {
  return {
    apiBaseUrl: env.VITE_API_BASE_URL || '/v1',
    enableMockApi: env.VITE_ENABLE_MOCK_API === 'true',
  };
}

export const appConfig = readAppConfig();
