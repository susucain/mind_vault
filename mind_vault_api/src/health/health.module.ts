import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { HealthDependency, HealthService } from './health.service';
import { createConnection } from 'node:net';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HealthService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<boolean>('HEALTH_CHECK_DEPENDENCIES', false);
        const probe = (host: string, port: number) =>
          new Promise<boolean>((resolve) => {
            const socket = createConnection({ host, port });
            const finish = (healthy: boolean) => {
              socket.destroy();
              resolve(healthy);
            };
            socket.setTimeout(800, () => finish(false));
            socket.once('connect', () => finish(true));
            socket.once('error', () => finish(false));
          });
        const dependencies: HealthDependency[] = enabled
          ? [
              {
                name: 'postgres',
                check: () =>
                  probe(
                    config.get<string>('POSTGRES_HOST', 'localhost'),
                    config.get<number>('POSTGRES_PORT', 5432),
                  ),
              },
              {
                name: 'mongodb',
                check: () =>
                  probe(
                    config.get<string>('MONGO_HOST', 'localhost'),
                    config.get<number>('MONGO_PORT', 27017),
                  ),
              },
              {
                name: 'rabbitmq',
                check: () =>
                  probe(
                    config.get<string>(
                      'infrastructure.rabbitmq.host',
                      'localhost',
                    ),
                    config.get<number>('infrastructure.rabbitmq.port', 5672),
                  ),
              },
              {
                name: 'elasticsearch',
                check: () =>
                  probe(
                    config.get<string>(
                      'infrastructure.elasticsearch.host',
                      'localhost',
                    ),
                    config.get<number>(
                      'infrastructure.elasticsearch.port',
                      9200,
                    ),
                  ),
              },
              {
                name: 'neo4j',
                check: () =>
                  probe(
                    config.get<string>(
                      'infrastructure.neo4j.host',
                      'localhost',
                    ),
                    config.get<number>('infrastructure.neo4j.port', 7687),
                  ),
              },
              ...(config.get<string>('OSS_BUCKET_NAME')
                ? []
                : [{ name: 'rustfs', check: () => probe('localhost', 9000) }]),
            ]
          : [];
        return new HealthService(dependencies);
      },
    },
  ],
})
export class HealthModule {}
