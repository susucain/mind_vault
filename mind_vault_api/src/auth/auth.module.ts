import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildConfiguration } from '../config/configuration';
import { RustfsService } from '../storage/rustfs.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

// APP_STANDALONE=true 时 AppModule 不注册 TypeORM；此处必须同步跳过 forFeature，
// 否则 AuthModule 会在没有 DataSource 的情况下解析仓储而启动失败。
const standalone = buildConfiguration(process.env).runtime.standalone;

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>(
          'auth.jwtSecret',
          'mind-vault-development-secret',
        ),
      }),
    }),
    ...(standalone ? [] : [TypeOrmModule.forFeature([UserEntity])]),
  ],
  controllers: [AuthController],
  // RustfsService 直接注册：它只依赖 ConfigService，与 document.module 的既有做法一致
  providers: [AuthService, AuthGuard, RustfsService],
  // JwtModule 必须一并导出：@UseGuards(AuthGuard) 是在使用方模块的注入上下文里
  // 构造 Guard 的，不导出则各业务模块解析不到 JwtService
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
