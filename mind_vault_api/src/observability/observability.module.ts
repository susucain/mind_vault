import { Global, Module } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';

/** 模型出口与各业务编排都要注入，做成全局模块省掉逐层 import */
@Global()
@Module({
  providers: [LangfuseService],
  exports: [LangfuseService],
})
export class ObservabilityModule {}
