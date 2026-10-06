jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { hashPassword } from '../common/password';
import { RustfsService } from '../storage/rustfs.service';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

const DEV_ACCOUNT = {
  id: '10001',
  username: 'dev',
  password: '123456',
  nickname: '开发用户',
};

const USER_ID = '1790000000000001';

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);

const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
]);

const NOT_IMAGE_BYTES = Buffer.from('definitely not an image');

function configWith(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;
}

function authConfig(): ConfigService {
  return configWith({ 'auth.devAccount': DEV_ACCOUNT });
}

async function storedUser(
  password: string,
  overrides: Partial<UserEntity> = {},
): Promise<UserEntity> {
  return {
    id: USER_ID,
    username: 'tester',
    nickname: 'tester',
    passwordHash: await hashPassword(password),
    status: 1,
    avatarKey: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
  } as UserEntity;
}

interface RepoMocks {
  repo: Repository<UserEntity>;
  findOne: jest.Mock;
  save: jest.Mock;
}

/** findOne 同时要服务 `where: { id }` 与 `where: { username }` 两种查询 */
function repositoryWith(options: {
  byId?: UserEntity | null;
  byUsername?: UserEntity | null;
  save?: jest.Mock;
}): RepoMocks {
  const findOne = jest.fn(({ where }: { where: Record<string, unknown> }) => {
    if ('id' in where) return options.byId ?? null;
    if ('username' in where) return options.byUsername ?? null;
    return null;
  });
  const save = options.save ?? jest.fn((value: UserEntity) => value);
  return {
    repo: { findOne, save } as unknown as Repository<UserEntity>,
    findOne,
    save,
  };
}

interface StorageMocks {
  storage: RustfsService;
  isEnabled: jest.Mock;
  uploadBytes: jest.Mock;
  downloadBytes: jest.Mock;
  deleteObject: jest.Mock;
}

function storageWith(
  options: {
    enabled?: boolean;
    uploadBytes?: jest.Mock;
    downloadBytes?: jest.Mock;
    deleteObject?: jest.Mock;
  } = {},
): StorageMocks {
  const isEnabled = jest.fn(() => options.enabled ?? true);
  const uploadBytes =
    options.uploadBytes ??
    jest.fn(() => Promise.resolve('avatars/1-avatar.webp'));
  const downloadBytes =
    options.downloadBytes ??
    jest.fn(() => Promise.resolve(Buffer.from('image-bytes')));
  const deleteObject = options.deleteObject ?? jest.fn(() => Promise.resolve());
  return {
    storage: {
      isEnabled,
      uploadBytes,
      downloadBytes,
      deleteObject,
    } as unknown as RustfsService,
    isEnabled,
    uploadBytes,
    downloadBytes,
    deleteObject,
  };
}

function serviceWith(options: {
  repo?: Repository<UserEntity>;
  config?: ConfigService;
  sign?: jest.Mock;
  storage?: RustfsService;
}) {
  return new AuthService(
    {
      sign: options.sign ?? jest.fn(() => 'access-token'),
    } as unknown as JwtService,
    options.config ?? authConfig(),
    options.storage ?? storageWith().storage,
    options.repo,
  );
}

describe('AuthService profile', () => {
  describe('getProfile', () => {
    it('returns the stored profile with username, created time and avatar key', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/1-avatar.webp',
      });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
      });

      const profile = await service.getProfile(USER_ID);

      expect(profile).toEqual({
        id: USER_ID,
        username: 'tester',
        nickname: 'tester',
        avatarKey: 'avatars/1-avatar.webp',
        createdAt: '2026-01-02T03:04:05.000Z',
        isDevAccount: false,
      });
    });

    it('synthesises a read-only profile for the un-stored dev account', async () => {
      const { repo, findOne } = repositoryWith({});
      const service = serviceWith({ repo });

      const profile = await service.getProfile('10001');

      expect(profile).toEqual({
        id: '10001',
        username: 'dev',
        nickname: '开发用户',
        avatarKey: null,
        createdAt: null,
        isDevAccount: true,
      });
      expect(findOne).not.toHaveBeenCalled();
    });

    it('throws when the token points at an unknown user', async () => {
      const service = serviceWith({ repo: repositoryWith({}).repo });

      await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateNickname', () => {
    it('stores the trimmed nickname and re-issues the token', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const sign = jest.fn(() => 'fresh-token');
      const service = serviceWith({ repo, sign });

      const result = await service.updateNickname(USER_ID, {
        nickname: '  老张  ',
      });

      expect(user.nickname).toBe('老张');
      expect(save).toHaveBeenCalledWith(user);
      expect(sign).toHaveBeenCalledWith(
        { sub: USER_ID, nickname: '老张' },
        { expiresIn: '7d' },
      );
      expect(result.accessToken).toBe('fresh-token');
      expect(result.user.nickname).toBe('老张');
    });

    it('rejects a whitespace-only nickname before touching the database', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const service = serviceWith({ repo });

      await expect(
        service.updateNickname(USER_ID, { nickname: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(save).not.toHaveBeenCalled();
    });

    it('refuses to modify the dev account', async () => {
      const { repo, save } = repositoryWith({});
      const service = serviceWith({ repo });

      await expect(
        service.updateNickname('10001', { nickname: '新名字' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('updateUsername', () => {
    it('rejects a wrong current password', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const service = serviceWith({ repo });

      await expect(
        service.updateUsername(USER_ID, {
          username: 'newname',
          currentPassword: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(save).not.toHaveBeenCalled();
    });

    it('reserves the dev username', async () => {
      const user = await storedUser('correct-horse');
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
      });

      await expect(
        service.updateUsername(USER_ID, {
          username: 'DEV',
          currentPassword: 'correct-horse',
        }),
      ).rejects.toThrow('该用户名不可用');
    });

    it('treats the current username as an idempotent success', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const sign = jest.fn(() => 'access-token');
      const service = serviceWith({ repo, sign });

      const result = await service.updateUsername(USER_ID, {
        username: '  Tester ',
        currentPassword: 'correct-horse',
      });

      expect(result.user.username).toBe('tester');
      expect(sign).toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects a username already taken by someone else', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({
        byId: user,
        byUsername: { id: 'other' } as UserEntity,
      });
      const service = serviceWith({ repo });

      await expect(
        service.updateUsername(USER_ID, {
          username: 'taken',
          currentPassword: 'correct-horse',
        }),
      ).rejects.toThrow('用户名已被占用');
      expect(save).not.toHaveBeenCalled();
    });

    it('normalises the username and follows the default nickname', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const service = serviceWith({ repo });

      const result = await service.updateUsername(USER_ID, {
        username: '  NewName ',
        currentPassword: 'correct-horse',
      });

      expect(user.username).toBe('newname');
      // 昵称仍等于旧登录名 → 说明用户没自定义过，跟着改，保持注册时的语义
      expect(user.nickname).toBe('newname');
      expect(save).toHaveBeenCalledWith(user);
      expect(result.user).toMatchObject({
        username: 'newname',
        nickname: 'newname',
      });
    });

    it('keeps a customised nickname untouched', async () => {
      const user = await storedUser('correct-horse', { nickname: '老张' });
      const { repo } = repositoryWith({ byId: user });
      const service = serviceWith({ repo });

      await service.updateUsername(USER_ID, {
        username: 'newname',
        currentPassword: 'correct-horse',
      });

      expect(user.username).toBe('newname');
      expect(user.nickname).toBe('老张');
    });

    it('maps a unique-index collision to a conflict', async () => {
      const user = await storedUser('correct-horse');
      const { repo } = repositoryWith({
        byId: user,
        save: jest.fn(() => Promise.reject(new Error('duplicate key'))),
      });
      const service = serviceWith({ repo });

      await expect(
        service.updateUsername(USER_ID, {
          username: 'newname',
          currentPassword: 'correct-horse',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateAvatar', () => {
    it('stores the object under the avatars prefix and writes back the key', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const storage = storageWith({
        uploadBytes: jest.fn(() => Promise.resolve('avatars/9-avatar.png')),
      });
      const service = serviceWith({ repo, storage: storage.storage });

      const result = await service.updateAvatar(USER_ID, {
        mimetype: 'image/png',
        buffer: PNG_BYTES,
      });

      expect(storage.uploadBytes).toHaveBeenCalledWith(PNG_BYTES, {
        fileName: 'avatar.png',
        contentType: 'image/png',
        prefix: 'avatars',
      });
      expect(user.avatarKey).toBe('avatars/9-avatar.png');
      expect(save).toHaveBeenCalledWith(user);
      expect(result.user.avatarKey).toBe('avatars/9-avatar.png');
    });

    it('trusts the magic number when no content type is declared', async () => {
      const user = await storedUser('correct-horse');
      const storage = storageWith({
        uploadBytes: jest.fn(() => Promise.resolve('avatars/9-avatar.webp')),
      });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      await service.updateAvatar(USER_ID, { buffer: WEBP_BYTES });

      expect(storage.uploadBytes).toHaveBeenCalledWith(
        WEBP_BYTES,
        expect.objectContaining({ contentType: 'image/webp' }),
      );
    });

    it('rejects payloads that are not really an image', async () => {
      const user = await storedUser('correct-horse');
      const storage = storageWith();
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      await expect(
        service.updateAvatar(USER_ID, {
          mimetype: 'image/png',
          buffer: NOT_IMAGE_BYTES,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.uploadBytes).not.toHaveBeenCalled();
    });

    it('rejects a declared content type outside the whitelist', async () => {
      const user = await storedUser('correct-horse');
      const storage = storageWith();
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      await expect(
        service.updateAvatar(USER_ID, {
          mimetype: 'text/plain',
          buffer: PNG_BYTES,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.uploadBytes).not.toHaveBeenCalled();
    });

    it('reports unavailable storage instead of failing silently', async () => {
      const user = await storedUser('correct-horse');
      const storage = storageWith({ enabled: false });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      await expect(
        service.updateAvatar(USER_ID, {
          mimetype: 'image/png',
          buffer: PNG_BYTES,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(storage.uploadBytes).not.toHaveBeenCalled();
    });

    it('deletes the previous object after a successful replacement', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/old-avatar.png',
      });
      const storage = storageWith({
        uploadBytes: jest.fn(() => Promise.resolve('avatars/9-avatar.png')),
      });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      await service.updateAvatar(USER_ID, {
        mimetype: 'image/png',
        buffer: PNG_BYTES,
      });

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'avatars/old-avatar.png',
      );
    });

    it('still succeeds when the old object cannot be deleted', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/old-avatar.png',
      });
      const storage = storageWith({
        uploadBytes: jest.fn(() => Promise.resolve('avatars/9-avatar.png')),
        deleteObject: jest.fn(() => Promise.reject(new Error('network'))),
      });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      const result = await service.updateAvatar(USER_ID, {
        mimetype: 'image/png',
        buffer: PNG_BYTES,
      });

      expect(result.user.avatarKey).toBe('avatars/9-avatar.png');
    });

    it('removes the freshly uploaded object when persisting the key fails', async () => {
      const user = await storedUser('correct-horse');
      const storage = storageWith({
        uploadBytes: jest.fn(() => Promise.resolve('avatars/9-avatar.png')),
      });
      const service = serviceWith({
        repo: repositoryWith({
          byId: user,
          save: jest.fn(() => Promise.reject(new Error('db down'))),
        }).repo,
        storage: storage.storage,
      });

      await expect(
        service.updateAvatar(USER_ID, {
          mimetype: 'image/png',
          buffer: PNG_BYTES,
        }),
      ).rejects.toThrow('db down');
      expect(storage.deleteObject).toHaveBeenCalledWith('avatars/9-avatar.png');
    });

    it('refuses to modify the dev account', async () => {
      const storage = storageWith();
      const service = serviceWith({ storage: storage.storage });

      await expect(
        service.updateAvatar('10001', {
          mimetype: 'image/png',
          buffer: PNG_BYTES,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.uploadBytes).not.toHaveBeenCalled();
    });
  });

  describe('readAvatar', () => {
    it('returns the bytes with a content type derived from the key', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/9-avatar.png',
      });
      const storage = storageWith();
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storage.storage,
      });

      const payload = await service.readAvatar(USER_ID);

      expect(storage.downloadBytes).toHaveBeenCalledWith(
        'avatars/9-avatar.png',
      );
      expect(payload.contentType).toBe('image/png');
      expect(payload.body).toBeInstanceOf(Buffer);
    });

    it('throws when the user never uploaded an avatar', async () => {
      const user = await storedUser('correct-horse');
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
      });

      await expect(service.readAvatar(USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when storage is disabled', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/9-avatar.webp',
      });
      const service = serviceWith({
        repo: repositoryWith({ byId: user }).repo,
        storage: storageWith({ enabled: false }).storage,
      });

      await expect(service.readAvatar(USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('removeAvatar', () => {
    it('clears the key and deletes the stored object', async () => {
      const user = await storedUser('correct-horse', {
        avatarKey: 'avatars/9-avatar.png',
      });
      const { repo, save } = repositoryWith({ byId: user });
      const storage = storageWith();
      const service = serviceWith({ repo, storage: storage.storage });

      const result = await service.removeAvatar(USER_ID);

      expect(user.avatarKey).toBeNull();
      expect(save).toHaveBeenCalledWith(user);
      expect(storage.deleteObject).toHaveBeenCalledWith('avatars/9-avatar.png');
      expect(result.user.avatarKey).toBeNull();
    });

    it('does nothing when there is no avatar to remove', async () => {
      const user = await storedUser('correct-horse');
      const { repo, save } = repositoryWith({ byId: user });
      const storage = storageWith();
      const service = serviceWith({ repo, storage: storage.storage });

      const result = await service.removeAvatar(USER_ID);

      expect(save).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
      expect(result.user.avatarKey).toBeNull();
    });
  });
});
