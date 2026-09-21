import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

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
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  // JwtModule 必须一并导出：@UseGuards(AuthGuard) 是在使用方模块的注入上下文里
  // 构造 Guard 的，不导出则各业务模块解析不到 JwtService
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
