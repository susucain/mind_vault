import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a password against its own hash', async () => {
    const stored = await hashPassword('correct-horse');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct-horse', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct-horse');
    await expect(verifyPassword('wrong-horse', stored)).resolves.toBe(false);
  });

  it('salts hashes so identical passwords differ', async () => {
    const first = await hashPassword('correct-horse');
    const second = await hashPassword('correct-horse');
    expect(first).not.toBe(second);
  });

  it('returns false instead of throwing on malformed input', async () => {
    for (const stored of [
      '',
      'plain-text',
      'scrypt$16384$8',
      'bcrypt$16384$8$1$abcd$ef',
      'scrypt$0$8$1$abcd$ef',
      'scrypt$16384$8$1$abcd$zz',
    ]) {
      await expect(verifyPassword('correct-horse', stored)).resolves.toBe(
        false,
      );
    }
  });

  it('rejects a tampered hash', async () => {
    const stored = await hashPassword('correct-horse');
    const parts = stored.split('$');
    const tampered = [...parts.slice(0, 5), 'f'.repeat(parts[5].length)].join(
      '$',
    );
    await expect(verifyPassword('correct-horse', tampered)).resolves.toBe(
      false,
    );
  });
});
