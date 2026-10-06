import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('auth/register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

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
