import {
  ConflictException,
  ForbiddenException,
  Injectable,
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
import { UserEntity } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
