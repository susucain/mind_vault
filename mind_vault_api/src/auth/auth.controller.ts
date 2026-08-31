import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/dev-login')
  devLogin(@Body() body: { userId?: string; nickname?: string }) {
    return this.authService.devLogin(
      body.userId ?? 'dev-user',
      body.nickname ?? '开发用户',
    );
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: { id: string; nickname?: string }) {
    return { user };
  }
}
