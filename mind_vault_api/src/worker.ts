import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // 只初始化 Nest 的依赖注入容器，不创建 HTTP server、不监听端口。
  // 但它会走完整个模块初始化流程，包括各个 Provider 的 onModuleInit() 生命周期钩子。
  await NestFactory.createApplicationContext(AppModule);
}

void bootstrap();
