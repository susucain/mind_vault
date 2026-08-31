import { HealthService, HealthStatus } from './health.service';

describe('HealthService', () => {
  it('returns an aggregated dependency status', async () => {
    const service = new HealthService([
      { name: 'postgres', check: () => Promise.resolve(true) },
      { name: 'mongodb', check: () => Promise.resolve(true) },
      { name: 'elasticsearch', check: () => Promise.resolve(false) },
    ]);

    await expect(service.check()).resolves.toEqual({
      status: HealthStatus.Degraded,
      dependencies: {
        postgres: 'up',
        mongodb: 'up',
        elasticsearch: 'down',
      },
    });
  });

  it('marks the system healthy when every dependency is reachable', async () => {
    const service = new HealthService([
      { name: 'postgres', check: () => Promise.resolve(true) },
    ]);

    await expect(service.check()).resolves.toEqual({
      status: HealthStatus.Ok,
      dependencies: { postgres: 'up' },
    });
  });
});
