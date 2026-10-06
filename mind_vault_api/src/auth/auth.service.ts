import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nextSnowflakeId } from '../common/snowflake-id';
import { hashPassword, verifyPassword } from '../common/password';
import { RustfsService } from '../storage/rustfs.service';
import { UserEntity } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';

interface DevAccount {
  id: string;
  username: string;
  password: string;
  nickname: string;
}

export interface AuthSession {
  accessToken: string;
  user: { id: string; nickname: string };
}

/** 设置页与顶栏共用的用户资料视图，避免各处自行拼装字段名 */
export interface ProfileView {
  id: string;
  username: string;
  nickname: string;
  avatarKey: string | null;
  createdAt: string | null;
  /** 开发账号只存在于环境变量里、不落库，前端据此禁用修改入口 */
  isDevAccount: boolean;
}

export interface ProfileSession {
  accessToken: string;
  user: ProfileView;
}

export interface AvatarUploadInput {
  mimetype?: string;
  buffer: Buffer;
}

export interface AvatarPayload {
  body: Buffer;
  contentType: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly storage: RustfsService,
    // standalone 模式不注册 TypeORM，此处保持可选以免启动失败
    @Optional()
    @InjectRepository(UserEntity)
    private readonly users?: Repository<UserEntity>,
  ) {}

  devLogin(userId: string, nickname = '开发用户') {
    if (!this.config.get<boolean>('auth.devLoginEnabled', true)) {
      throw new ForbiddenException('开发登录已禁用');
    }

    return {
      accessToken: this.jwt.sign(
        { sub: userId, nickname },
        { expiresIn: '7d' },
      ),
      user: { id: userId, nickname },
    };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const username = dto.username.trim().toLowerCase();

    // 开发账号来自环境变量，不落库；密码未经过注册规则校验
    const dev = this.devAccount();
    if (
      this.config.get<boolean>('auth.devLoginEnabled', true) &&
      username === dev.username &&
      dto.password === dev.password
    ) {
      return this.issueSession(dev.id, dev.nickname);
    }

    const user = await this.repository().findOne({ where: { username } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.issueSession(user.id, user.nickname ?? user.username);
  }

  async register(dto: RegisterDto): Promise<AuthSession> {
    const username = dto.username.trim().toLowerCase();
    if (username === this.devAccount().username) {
      throw new ConflictException('该用户名不可用');
    }

    const users = this.repository();
    if (await users.findOne({ where: { username } })) {
      throw new ConflictException('用户名已被注册');
    }

    const user = users.create({
      id: nextSnowflakeId(),
      username,
      passwordHash: await hashPassword(dto.password),
      nickname: username,
      status: 1,
    });

    try {
      await users.save(user);
    } catch {
      // 并发注册撞唯一索引
      throw new ConflictException('用户名已被注册');
    }

    return this.issueSession(user.id, user.nickname ?? username);
  }

  /** 个人信息：查库返回真实资料（用户名 / 注册时间 / 头像），不再只回显 JWT 载荷 */
  async getProfile(userId: string): Promise<ProfileView> {
    // 开发账号不落库，且 standalone 模式无库可查，先按环境变量合成一份只读资料
    const dev = this.devAccount();
    if (userId === dev.id) {
      return {
        id: dev.id,
        username: dev.username,
        nickname: dev.nickname,
        avatarKey: null,
        createdAt: null,
        isDevAccount: true,
      };
    }

    const user = await this.repository().findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return toProfileView(user);
  }

  /** 改昵称：昵称写在 JWT 载荷里，改动后必须重新签发，否则顶栏会一直显示旧值 */
  async updateNickname(
    userId: string,
    dto: UpdateNicknameDto,
  ): Promise<ProfileSession> {
    const nickname = dto.nickname.trim();
    // DTO 的 MinLength 只看原始串，全空格的输入会在 trim 后变成空昵称
    if (!nickname) {
      throw new BadRequestException('昵称不能为空');
    }

    const user = await this.writableUser(userId);
    user.nickname = nickname;
    await this.repository().save(user);
    return this.profileSession(user);
  }

  /** 改登录名：需当前密码确认，并依次过保留名、幂等、重名三道检查 */
  async updateUsername(
    userId: string,
    dto: UpdateUsernameDto,
  ): Promise<ProfileSession> {
    const user = await this.writableUser(userId);

    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码不正确');
    }

    const username = dto.username.trim().toLowerCase();
    if (username === this.devAccount().username) {
      throw new ConflictException('该用户名不可用');
    }
    // 与自身当前登录名相同：幂等成功，不重复写库也不报错
    if (username === user.username) {
      return this.profileSession(user);
    }

    const users = this.repository();
    if (await users.findOne({ where: { username } })) {
      throw new ConflictException('用户名已被占用');
    }

    const previousUsername = user.username;
    user.username = username;
    // 昵称默认与登录名一致（注册时的语义）；用户自定义过昵称就不再联动
    if (!user.nickname || user.nickname === previousUsername) {
      user.nickname = username;
    }

    try {
      await users.save(user);
    } catch {
      // 并发改同名撞唯一索引
      throw new ConflictException('用户名已被占用');
    }
    return this.profileSession(user);
  }

  /** 上传头像：先写对象存储再回写 key，旧对象尽力删除（删不掉不影响本次成功） */
  async updateAvatar(
    userId: string,
    file: AvatarUploadInput,
  ): Promise<{ user: ProfileView }> {
    const user = await this.writableUser(userId);

    // mimetype 由客户端给出、不可信，魔数才是真实类型，两者都必须在白名单内
    const contentType = resolveAvatarContentType(file);
    if (!contentType) {
      throw new BadRequestException('仅支持 PNG / JPEG / WebP 图片');
    }
    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableException('头像存储未启用，请联系管理员');
    }

    const previousKey = user.avatarKey ?? null;
    const key = await this.storage.uploadBytes(file.buffer, {
      fileName: `avatar.${extensionForContentType(contentType)}`,
      contentType,
      prefix: 'avatars',
    });

    user.avatarKey = key;
    try {
      await this.repository().save(user);
    } catch (error) {
      // 写库失败就撤掉刚上传的对象，避免留下无人引用的孤儿文件
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }

    await this.removeObject(previousKey, key);
    return { user: toProfileView(user) };
  }

  /** 读取当前用户头像，由 controller 以 StreamableFile 输出 */
  async readAvatar(userId: string): Promise<AvatarPayload> {
    const user = await this.repository().findOne({ where: { id: userId } });
    const key = user?.avatarKey;
    if (!key) {
      throw new NotFoundException('尚未设置头像');
    }
    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableException('头像存储未启用，请联系管理员');
    }

    return {
      body: await this.storage.downloadBytes(key),
      contentType: contentTypeForKey(key),
    };
  }

  /** 移除头像，前端回落为派生的首字母默认头像 */
  async removeAvatar(userId: string): Promise<{ user: ProfileView }> {
    const user = await this.writableUser(userId);
    const previousKey = user.avatarKey ?? null;
    if (!previousKey) {
      return { user: toProfileView(user) };
    }

    user.avatarKey = null;
    await this.repository().save(user);
    await this.removeObject(previousKey, null);
    return { user: toProfileView(user) };
  }

  /** 取可写用户：开发账号不落库，一律拒绝写操作，避免"改完刷新就回滚"的幽灵行为 */
  private async writableUser(userId: string): Promise<UserEntity> {
    if (userId === this.devAccount().id) {
      throw new ForbiddenException('开发账号不支持修改资料');
    }
    const user = await this.repository().findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  /** 删除已被替换的头像对象；存储未启用或删除失败都只记日志，不影响主流程 */
  private async removeObject(
    previousKey: string | null,
    currentKey: string | null,
  ): Promise<void> {
    if (!previousKey || previousKey === currentKey) return;
    if (!this.storage.isEnabled()) return;
    await this.storage.deleteObject(previousKey).catch((error: unknown) => {
      this.logger.warn(`旧头像删除失败 key=${previousKey}: ${String(error)}`);
    });
  }

  private profileSession(user: UserEntity): ProfileSession {
    return {
      accessToken: this.jwt.sign(
        { sub: user.id, nickname: user.nickname ?? user.username },
        { expiresIn: '7d' },
      ),
      user: toProfileView(user),
    };
  }

  private repository(): Repository<UserEntity> {
    if (!this.users) {
      throw new ServiceUnavailableException('账号服务不可用');
    }
    return this.users;
  }

  private devAccount(): DevAccount {
    return {
      id: '10001',
      username: 'dev',
      password: '123456',
      nickname: '开发用户',
      ...(this.config.get<Partial<DevAccount>>('auth.devAccount') ?? {}),
    };
  }

  private issueSession(id: string, nickname: string): AuthSession {
    return {
      accessToken: this.jwt.sign({ sub: id, nickname }, { expiresIn: '7d' }),
      user: { id, nickname },
    };
  }
}

const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 按魔数识别真实图片类型：只信 mimetype 会让改扩展名的任意文件过关 */
function detectImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** 认证类型以魔数结果为准；客户端声明了具体类型时也必须在白名单内 */
function resolveAvatarContentType(file: AvatarUploadInput): string | null {
  const detected = detectImageType(file.buffer);
  if (!detected) return null;

  const declared = (file.mimetype ?? '').trim().toLowerCase();
  if (declared && !ALLOWED_AVATAR_TYPES.has(declared)) return null;
  return detected;
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  return 'webp';
}

/** key 的扩展名由上传时按真实类型写入，据此还原响应头 */
function contentTypeForKey(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'image/webp';
}

function toProfileView(user: UserEntity): ProfileView {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname ?? user.username,
    avatarKey: user.avatarKey ?? null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    isDevAccount: false,
  };
}
