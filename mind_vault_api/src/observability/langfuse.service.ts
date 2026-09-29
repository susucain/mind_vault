import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor, type MaskFunction } from '@langfuse/otel';
import { CallbackHandler } from '@langfuse/langchain';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';

/**
 * 一次业务操作的上下文。同一操作内所有模型调用会挂在同一条 trace 下，
 * 便于按用户、会话、功能回溯整条链路。
 */
export interface TraceContext<T> {
  /** trace 名称，用业务动作命名（如 chat.ask），便于检索与筛选 */
  name: string;
  /** 链路入参，写在根节点上，打开 trace 就能看到这次操作在做什么 */
  input?: unknown;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  /** 额外的字符串维度（如 documentId），超过 200 字符的值会被上游丢弃 */
  metadata?: Record<string, string>;
  /** 从返回值里挑出要记录的输出，避免把内部状态整包写进 trace */
  output?: (result: T) => unknown;
}

/** trace 根节点，只暴露写输出的能力；未启用时是空实现 */
export interface TraceSpan {
  update(attributes: { output?: unknown }): void;
}

const inactiveSpan: TraceSpan = { update: () => undefined };

const secretPattern = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g;

/**
 * 只遮蔽明显的凭据串，业务内容原样保留：
 * trace 的价值就在于能看到真实输入输出，过度脱敏等于没接监控。
 */
const maskSecrets: MaskFunction = ({ data }: { data: unknown }) =>
  typeof data === 'string' ? data.replace(secretPattern, '[REDACTED]') : data;

@Injectable()
export class LangfuseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LangfuseService.name);
  private readonly enabled: boolean;
  private sdk?: NodeSDK;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      this.config.get<boolean>('langfuse.enabled') === true &&
      Boolean(this.config.get<string>('langfuse.publicKey')) &&
      Boolean(this.config.get<string>('langfuse.secretKey'));
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Langfuse 监控未启用');
      return;
    }
    // tracer provider 是进程级单例，生命周期必须跟着 Nest 容器走：
    // 启动时注册，容器关闭时 flush，否则退出时批次里的 span 会丢。
    const sdk = new NodeSDK({
      spanProcessors: [
        new LangfuseSpanProcessor({
          publicKey: this.config.get<string>('langfuse.publicKey'),
          secretKey: this.config.get<string>('langfuse.secretKey'),
          baseUrl: this.config.get<string>('langfuse.baseUrl'),
          environment: this.config.get<string>('langfuse.environment'),
          flushInterval: this.config.get<number>('langfuse.flushInterval'),
          mask: maskSecrets,
        }),
      ],
    });
    sdk.start();
    this.sdk = sdk;
    this.logger.log(
      `Langfuse 监控已启用: baseUrl=${this.config.get<string>('langfuse.baseUrl')} environment=${this.config.get<string>('langfuse.environment')}`,
    );
  }

  async onApplicationShutdown() {
    await this.sdk?.shutdown();
    this.sdk = undefined;
  }

  /**
   * 模型调用要挂的 LangChain 回调。
   * 每次都新建实例：handler 内部按 runId 维护状态，复用会让并发请求互相覆盖。
   */
  callbacks(): CallbackHandler[] {
    return this.enabled ? [new CallbackHandler()] : [];
  }

  /** 把一次业务操作包成一条 trace；未启用时直接执行 fn，不产生额外开销 */
  trace<T>(
    context: TraceContext<T>,
    fn: (span: TraceSpan) => Promise<T>,
  ): Promise<T> {
    if (!this.enabled) return fn(inactiveSpan);
    return startActiveObservation(context.name, (span) =>
      propagateAttributes(
        {
          userId: context.userId,
          sessionId: context.sessionId,
          tags: context.tags,
          metadata: context.metadata,
        },
        async () => {
          span.update({ input: context.input });
          const result = await fn(span);
          if (context.output) span.update({ output: context.output(result) });
          return result;
        },
      ),
    );
  }
}
