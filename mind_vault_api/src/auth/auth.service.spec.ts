jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { hashPassword, verifyPassword } from '../common/password';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

const DEV_ACCOUNT = {
  id: '10001',
  username: 'dev',
  password: '123456',
  nickname: '开发用户',
};

const STORED_USER = {
  id: '1790000000000001',
  username: 'tester',
  nickname: 'tester',
  status: 1,
};

function configWith(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;
}

interface RepoMocks {
  repo: Repository<UserEntity>;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

function repositoryWith(
  overrides: Partial<Record<'findOne' | 'create' | 'save', jest.Mock>> = {},
): RepoMocks {
  const findOne = overrides.findOne ?? jest.fn(() => null);
  const create = overrides.create ?? jest.fn((value: unknown) => value);
  const save = overrides.save ?? jest.fn((value: unknown) => value);
  return {
    repo: { findOne, create, save } as unknown as Repository<UserEntity>,
    findOne,
    create,
    save,
  };
}

function serviceWith(options: {
  repo?: Repository<UserEntity>;
  config?: ConfigService;
  sign?: jest.Mock;
}) {
  return new AuthService(
    {
      sign: options.sign ?? jest.fn(() => 'access-token'),
    } as unknown as JwtService,
    options.config ?? configWith({ 'auth.devLoginEnabled': true }),
    options.repo,
  );
}

describe('AuthService', () => {
  describe('devLogin', () => {
    it('creates a development token with the requested user identity', () => {
      const sign = jest.fn(() => 'access-token');
      const service = serviceWith({
        sign,
        config: configWith({ 'auth.devLoginEnabled': true }),
      });

      const result = service.devLogin('10001', '开发用户');

      expect(sign).toHaveBeenCalledWith(
        { sub: '10001', nickname: '开发用户' },
        { expiresIn: '7d' },
      );
      expect(result.accessToken).toBe('access-token');
      expect(result.user).toEqual({ id: '10001', nickname: '开发用户' });
    });

    it('rejects development login when it is disabled', () => {
      const sign = jest.fn();
      const service = serviceWith({
        sign,
        config: configWith({ 'auth.devLoginEnabled': false }),
      });

      expect(() => service.devLogin('10001')).toThrow('开发登录已禁用');
      expect(sign).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('signs in the environment dev account without touching the database', async () => {
      const { repo, findOne } = repositoryWith();
      const sign = jest.fn(() => 'access-token');
      const service = serviceWith({
        repo,
        sign,
        config: configWith({
          'auth.devLoginEnabled': true,
          'auth.devAccount': DEV_ACCOUNT,
        }),
      });

      const result = await service.login({
        username: 'dev',
        password: '123456',
      });

      expect(result).toEqual({
        accessToken: 'access-token',
        user: { id: '10001', nickname: '开发用户' },
      });
      expect(sign).toHaveBeenCalledWith(
        { sub: '10001', nickname: '开发用户' },
        { expiresIn: '7d' },
      );
      expect(findOne).not.toHaveBeenCalled();
    });

    it('ignores the dev account when development login is disabled', async () => {
      const { repo } = repositoryWith();
      const service = serviceWith({
        repo,
        config: configWith({
          'auth.devLoginEnabled': false,
          'auth.devAccount': DEV_ACCOUNT,
        }),
      });

      await expect(
        service.login({ username: 'dev', password: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('signs in a registered user with a matching password', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { repo, findOne } = repositoryWith({
        findOne: jest.fn(() => ({ ...STORED_USER, passwordHash })),
      });
      const service = serviceWith({ repo });

      const result = await service.login({
        username: '  Tester ',
        password: 'correct-horse',
      });

      expect(findOne).toHaveBeenCalledWith({ where: { username: 'tester' } });
      expect(result.user).toEqual({
        id: STORED_USER.id,
        nickname: 'tester',
      });
    });

    it('rejects an unknown username and a wrong password with the same error', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { repo, findOne } = repositoryWith({
        findOne: jest.fn((options: { where: { username: string } }) =>
          options.where.username === 'tester'
            ? { ...STORED_USER, passwordHash }
            : null,
        ),
      });
      const service = serviceWith({ repo });

      expect(findOne).toBeDefined();
      await expect(
        service.login({ username: 'nobody', password: 'correct-horse' }),
      ).rejects.toThrow('用户名或密码错误');
      await expect(
        service.login({ username: 'tester', password: 'wrong-password' }),
      ).rejects.toThrow('用户名或密码错误');
    });

    it('rejects disabled accounts', async () => {
      const passwordHash = await hashPassword('correct-horse');
      const { repo } = repositoryWith({
        findOne: jest.fn(() => ({ ...STORED_USER, passwordHash, status: 0 })),
      });
      const service = serviceWith({ repo });

      await expect(
        service.login({ username: 'tester', password: 'correct-horse' }),
      ).rejects.toThrow('用户名或密码错误');
    });
  });

  describe('register', () => {
    it('reserves the environment dev username', async () => {
      const { repo, save } = repositoryWith();
      const service = serviceWith({
        repo,
        config: configWith({ 'auth.devAccount': DEV_ACCOUNT }),
      });

      await expect(
        service.register({ username: 'dev', password: '12345678' }),
      ).rejects.toThrow('该用户名不可用');
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects an already registered username', async () => {
      const { repo, save } = repositoryWith({
        findOne: jest.fn(() => STORED_USER),
      });
      const service = serviceWith({ repo });

      await expect(
        service.register({ username: 'tester', password: '12345678' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    });

    it('stores a hashed password and signs the new user in', async () => {
      const created: UserEntity[] = [];
      const { repo } = repositoryWith({
        create: jest.fn((value: UserEntity) => {
          created.push(value);
          return value;
        }),
      });
      const service = serviceWith({ repo });

      const result = await service.register({
        username: 'Tester',
        password: '12345678',
      });

      expect(created).toHaveLength(1);
      const saved = created[0];
      expect(saved.username).toBe('tester');
      expect(saved.passwordHash).not.toContain('12345678');
      expect(await verifyPassword('12345678', saved.passwordHash)).toBe(true);
      expect(saved.id).toMatch(/^\d+$/);
      expect(result.user).toEqual({ id: saved.id, nickname: 'tester' });
      expect(result.accessToken).toBe('access-token');
    });
  });
});
