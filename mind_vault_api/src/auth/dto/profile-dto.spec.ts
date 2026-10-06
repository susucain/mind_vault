import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NICKNAME_MAX_LENGTH, UpdateNicknameDto } from './update-nickname.dto';
import { UpdateUsernameDto } from './update-username.dto';

/** 走真实的 class-transformer + class-validator 链路，验证 trim 与校验的先后顺序 */
async function validateWith<T extends object>(
  type: new () => T,
  payload: Record<string, unknown>,
): Promise<T> {
  const instance = plainToInstance(type, payload);
  const errors = await validate(instance as object);
  if (errors.length > 0) {
    throw new Error(
      Object.values(errors[0].constraints ?? {}).join(' / ') || '校验失败',
    );
  }
  return instance;
}

describe('UpdateUsernameDto', () => {
  it('trims the surrounding whitespace before matching the pattern', async () => {
    const dto = await validateWith(UpdateUsernameDto, {
      username: '  NewName ',
      currentPassword: 'pass12345',
    });

    expect(dto.username).toBe('NewName');
  });

  it.each([
    ['  ab  ', '短于 3 位'],
    ['has space', '中间含空格'],
    ['bad!chars', '含非法字符'],
    ['a'.repeat(65), '超过 64 位'],
  ])('rejects %s (%s)', async (username) => {
    await expect(
      validateWith(UpdateUsernameDto, {
        username,
        currentPassword: 'pass12345',
      }),
    ).rejects.toThrow('用户名需为 3-64 位字母、数字、下划线或中划线');
  });

  it('requires the current password', async () => {
    await expect(
      validateWith(UpdateUsernameDto, { username: 'newname' }),
    ).rejects.toThrow('请输入当前密码');
    await expect(
      validateWith(UpdateUsernameDto, {
        username: 'newname',
        currentPassword: '',
      }),
    ).rejects.toThrow('请输入当前密码');
  });
});

describe('UpdateNicknameDto', () => {
  it('trims the nickname', async () => {
    const dto = await validateWith(UpdateNicknameDto, {
      nickname: '  老张  ',
    });

    expect(dto.nickname).toBe('老张');
  });

  it('applies the length limit to the trimmed value', async () => {
    const dto = await validateWith(UpdateNicknameDto, {
      // 31 个字 + 1 个空格：若先校验长度就会被误判为超限
      nickname: `${'a'.repeat(NICKNAME_MAX_LENGTH - 1)} `,
    });

    expect(dto.nickname).toHaveLength(NICKNAME_MAX_LENGTH - 1);
  });

  it('rejects a whitespace-only or over-long nickname', async () => {
    await expect(
      validateWith(UpdateNicknameDto, { nickname: '   ' }),
    ).rejects.toThrow('昵称不能为空');
    await expect(
      validateWith(UpdateNicknameDto, { nickname: 'a'.repeat(33) }),
    ).rejects.toThrow('昵称最多 32 个字符');
  });
});
