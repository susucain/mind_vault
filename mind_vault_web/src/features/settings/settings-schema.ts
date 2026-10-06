import { z } from 'zod';

/** 上限与后端 UpdateNicknameDto 同源：改后端必须同步这里，否则表单会放过服务端拒绝的输入 */
export const NICKNAME_MAX = 32;
/** 与后端 register.dto.ts 的 USERNAME_PATTERN 保持同源 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;
/** 对齐后端 memoryConfig.maxContentChars */
export const MEMORY_CONTENT_MAX = 200;

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, '昵称不能为空')
  .max(NICKNAME_MAX, `昵称最多 ${NICKNAME_MAX} 个字符`);

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN, '需为 3-64 位字母、数字、下划线或中划线');

export const memoryContentSchema = z
  .string()
  .trim()
  .min(1, '请输入记忆内容')
  .max(MEMORY_CONTENT_MAX, `最多 ${MEMORY_CONTENT_MAX} 字`);

export type NicknameInput = z.infer<typeof nicknameSchema>;
export type UsernameInput = z.infer<typeof usernameSchema>;
export type MemoryContentInput = z.infer<typeof memoryContentSchema>;

/** 表单就地提示只需要第一条错误文案，取不到则返回 null 表示校验通过 */
export function firstIssueMessage(result: z.ZodSafeParseResult<unknown>): string | null {
  return result.success ? null : (result.error.issues[0]?.message ?? '输入不合法');
}

export function validateNickname(value: string): string | null {
  return firstIssueMessage(nicknameSchema.safeParse(value));
}

export function validateUsername(value: string): string | null {
  return firstIssueMessage(usernameSchema.safeParse(value));
}

export function validateMemoryContent(value: string): string | null {
  return firstIssueMessage(memoryContentSchema.safeParse(value));
}