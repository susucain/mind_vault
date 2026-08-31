import { Injectable } from '@nestjs/common';

export enum HealthStatus {
  Ok = 'ok',
  Degraded = 'degraded',
}

export interface HealthDependency {
  name: string;
  check: () => Promise<boolean>;
}

@Injectable()
export class HealthService {
  constructor(private readonly dependencies: HealthDependency[] = []) {}

  async check() {
    const entries = await Promise.all(
      this.dependencies.map(async ({ name, check }) => {
        try {
          return [name, (await check()) ? 'up' : 'down'] as const;
        } catch {
          return [name, 'down'] as const;
        }
      }),
    );
    const dependencyStatus = Object.fromEntries(entries);
    const healthy = entries.every(([, status]) => status === 'up');
    return {
      status: healthy ? HealthStatus.Ok : HealthStatus.Degraded,
      dependencies: dependencyStatus,
    };
  }
}
