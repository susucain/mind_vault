import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearMemories,
  createMemory,
  deleteMemory,
  getMemoryStats,
  listMemories,
  updateMemory,
} from '../../api/memories';
import type { MemoryInput, MemoryPatch, MemoryQuery } from '../../api/memories';
import {
  fetchAvatarBlob,
  getProfile,
  removeAvatar,
  updateNickname,
  updateUsername,
  uploadAvatar,
} from '../../api/profile';
import type { Profile, ProfileSession } from '../../api/profile';
import { useAuthStore } from '../../stores/auth.store';

/** 统一前缀：退出登录时可按 ['settings'] 一次性失效，不必逐个列举 */
export const settingsKeys = {
  all: ['settings'] as const,
  profile: ['settings', 'profile'] as const,
  memories: (query: MemoryQuery) => ['settings', 'memories', query] as const,
  memoryStats: ['settings', 'memory-stats'] as const,
};

function toAuthUser(user: Profile) {
  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    avatarKey: user.avatarKey,
  };
}

/** 顶栏读的是 auth store，不是 profile 查询，因此资料变更必须同时写回 store */
function useProfileWriter() {
  const queryClient = useQueryClient();

  return (user: Profile, accessToken?: string) => {
    queryClient.setQueryData(settingsKeys.profile, { user });
    const token = accessToken ?? useAuthStore.getState().token;
    if (token) useAuthStore.getState().setSession({ token, user: toAuthUser(user) });
  };
}

export function useProfile() {
  return useQuery({
    queryKey: settingsKeys.profile,
    queryFn: getProfile,
    select: (response: { user: Profile }) => response.user,
  });
}

export function useUpdateNickname() {
  const writeProfile = useProfileWriter();
  return useMutation({
    mutationFn: (nickname: string) => updateNickname(nickname),
    onSuccess: (session: ProfileSession) => writeProfile(session.user, session.accessToken),
  });
}

export function useUpdateUsername() {
  const writeProfile = useProfileWriter();
  return useMutation({
    mutationFn: (input: { username: string; currentPassword: string }) => updateUsername(input),
    onSuccess: (session: ProfileSession) => writeProfile(session.user, session.accessToken),
  });
}

export function useUploadAvatar() {
  const writeProfile = useProfileWriter();
  return useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (response: { user: Profile }) => writeProfile(response.user),
  });
}

export function useRemoveAvatar() {
  const writeProfile = useProfileWriter();
  return useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: (response: { user: Profile }) => writeProfile(response.user),
  });
}

/**
 * 头像按 avatarKey 缓存 object URL。这里刻意不在组件卸载时 revoke：
 * 列表/表单切换会反复挂载同一个 key，revoke 掉缓存就等于每次重新下载。
 * 生命周期跟着会话走，退出登录时由 revokeAllAvatarUrls() 统一释放。
 */
const avatarUrlCache = new Map<string, string>();

export function revokeAllAvatarUrls(): void {
  avatarUrlCache.forEach((url) => URL.revokeObjectURL(url));
  avatarUrlCache.clear();
}

export function useAvatarUrl(avatarKey: string | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ['settings', 'avatar', avatarKey],
    enabled: Boolean(avatarKey),
    // 同一个 key 的字节不会变，交给缓存订阅即可，不必手写 effect
    staleTime: Infinity,
    queryFn: async () => {
      const key = String(avatarKey);
      const cached = avatarUrlCache.get(key);
      if (cached) return cached;
      const created = URL.createObjectURL(await fetchAvatarBlob());
      avatarUrlCache.set(key, created);
      return created;
    },
  });

  return data;
}

export function useMemories(query: MemoryQuery) {
  return useQuery({
    queryKey: settingsKeys.memories(query),
    queryFn: () => listMemories(query),
    // 翻页/换筛选时保留上一页结果，避免整块骨架屏闪烁
    placeholderData: keepPreviousData,
  });
}

export function useMemoryStats() {
  return useQuery({
    queryKey: settingsKeys.memoryStats,
    queryFn: getMemoryStats,
  });
}

/** 条目变更后计数必须跟着变，两个缓存一起失效 */
function useInvalidateMemories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['settings', 'memories'] });
    void queryClient.invalidateQueries({ queryKey: settingsKeys.memoryStats });
  };
}

export function useCreateMemory() {
  const invalidate = useInvalidateMemories();
  return useMutation({
    mutationFn: (input: MemoryInput) => createMemory(input),
    onSuccess: invalidate,
  });
}

export function useUpdateMemory() {
  const invalidate = useInvalidateMemories();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MemoryPatch }) => updateMemory(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteMemory() {
  const invalidate = useInvalidateMemories();
  return useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: invalidate,
  });
}

export function useClearMemories() {
  const invalidate = useInvalidateMemories();
  return useMutation({
    mutationFn: () => clearMemories(),
    onSuccess: invalidate,
  });
}