import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';

/** 头像上限 2MB：前端裁剪后通常 < 100KB，这里只是服务端兜底 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

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

  /** 个人信息：返回库里的真实资料（用户名 / 注册时间 / 头像），不再回显 JWT 载荷 */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return { user: await this.authService.getProfile(user.id) };
  }

  @Patch('me')
  @UseGuards(AuthGuard, RateLimitGuard)
  updateNickname(
    @CurrentUser() user: { id: string },
    @Body() body: UpdateNicknameDto,
  ) {
    return this.authService.updateNickname(user.id, body);
  }

  @Patch('me/username')
  @UseGuards(AuthGuard, RateLimitGuard)
  updateUsername(
    @CurrentUser() user: { id: string },
    @Body() body: UpdateUsernameDto,
  ) {
    return this.authService.updateUsername(user.id, body);
  }

  @Post('me/avatar')
  @UseGuards(AuthGuard, RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的图片');
    }
    return this.authService.updateAvatar(user.id, file);
  }

  // 头像挂的是当前用户的私有对象，按用户维度缓存、不进共享缓存
  @Get('me/avatar')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'private, max-age=86400')
  async avatar(@CurrentUser() user: { id: string }) {
    const { body, contentType } = await this.authService.readAvatar(user.id);
    return new StreamableFile(body, { type: contentType });
  }

  @Delete('me/avatar')
  @UseGuards(AuthGuard, RateLimitGuard)
  removeAvatar(@CurrentUser() user: { id: string }) {
    return this.authService.removeAvatar(user.id);
  }
}
