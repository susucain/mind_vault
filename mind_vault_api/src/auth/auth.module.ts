import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    {
      provide: TokenService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TokenService(
          config.get<string>('auth.jwtSecret', 'mind-vault-development-secret'),
        ),
    },
  ],
  exports: [AuthGuard, TokenService],
})
export class AuthModule {}
