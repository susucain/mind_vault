import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, Pencil } from 'lucide-react';
import { Button, Dialog, ErrorState, Input, LoadingState, StatusBadge } from '../../../components/ui';
import { useProfile, useUpdateNickname, useUpdateUsername } from '../../../features/settings/queries';
import { NICKNAME_MAX, validateNickname, validateUsername } from '../../../features/settings/settings-schema';
import { EMPTY_VALUE, describeProfileError, formatAbsoluteTime } from '../../../features/settings/settings-labels';
import { AvatarUploader } from '../components/AvatarUploader';
import { ProfileField } from '../components/ProfileField';

export function AccountSection() {
  const profileQuery = useProfile();
  const updateNickname = useUpdateNickname();
  const updateUsername = useUpdateUsername();

  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const disabled = profileQuery.data?.isDevAccount ?? false;

  // 标题常驻：加载/失败时分区名也要可见，否则骨架期整块空白
  const heading = (
    <div className="section-heading">
      <h2>账户信息</h2>
      {disabled ? <StatusBadge tone="warning">开发账号</StatusBadge> : null}
    </div>
  );

  if (profileQuery.isPending) {
    return (
      <section className="settings-panel">
        {heading}
        <LoadingState label="加载账户信息" />
      </section>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <section className="settings-panel">
        {heading}
        <ErrorState onRetry={() => void profileQuery.refetch()} title="账户信息加载失败" />
      </section>
    );
  }

  const profile = profileQuery.data;

  function startNicknameEdit() {
    setNicknameDraft(profile.nickname);
    setNicknameError(null);
    setFeedback(null);
    setEditingNickname(true);
  }

  function submitNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateNickname(nicknameDraft);
    if (message) {
      setNicknameError(message);
      return;
    }
    setNicknameError(null);
    updateNickname.mutate(nicknameDraft.trim(), {
      onSuccess: () => {
        setEditingNickname(false);
        setFeedback('昵称已更新');
      },
      onError: (error) => setNicknameError(describeProfileError(error)),
    });
  }

  function submitUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username') ?? '');
    const currentPassword = String(data.get('password') ?? '');

    const usernameIssue = validateUsername(username);
    if (usernameIssue) {
      setUsernameError(usernameIssue);
      return;
    }
    if (!currentPassword) {
      setUsernameError('请输入当前密码');
      return;
    }

    setUsernameError(null);
    updateUsername.mutate(
      { username: username.trim(), currentPassword },
      {
        onSuccess: () => {
          setUsernameOpen(false);
          setFeedback('用户名已更新，下次登录请使用新用户名');
        },
        onError: (error) => setUsernameError(describeProfileError(error)),
      },
    );
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(profile.id);
      setFeedback('用户 ID 已复制');
    } catch {
      setFeedback(null);
    }
  }

  return (
    <section className="settings-panel">
      {heading}

      {disabled ? (
        <div className="capability-notice" role="status">
          <KeyRound aria-hidden="true" size={18} />
          <div>
            <strong>开发账号不支持修改资料</strong>
            <span>该账号来自环境变量、不写入数据库，改动不会生效。</span>
          </div>
        </div>
      ) : null}

      <AvatarUploader profile={profile} />

      {feedback ? <p className="settings-feedback" role="status">{feedback}</p> : null}

      <div className="settings-fields">
        {editingNickname ? (
          <form className="settings-field-row" onSubmit={submitNickname}>
            <span className="settings-field-row__label">昵称</span>
            <div className="settings-field-row__value">
              <div className="form-field">
                <div className="field-header">
                  <label htmlFor="profile-nickname">昵称</label>
                  <span className="field-hint">{nicknameDraft.length}/{NICKNAME_MAX}</span>
                </div>
                <Input
                  autoFocus
                  id="profile-nickname"
                  maxLength={NICKNAME_MAX}
                  onChange={(event) => {
                    setNicknameDraft(event.target.value);
                    setNicknameError(validateNickname(event.target.value));
                  }}
                  value={nicknameDraft}
                />
                {nicknameError ? <p className="form-error">{nicknameError}</p> : null}
              </div>
            </div>
            <div className="settings-field-row__action">
              <Button disabled={updateNickname.isPending} type="submit">
                {updateNickname.isPending ? <LoaderCircle className="spin-icon" size={15} /> : <Check size={15} />}保存
              </Button>
              <Button
                disabled={updateNickname.isPending}
                onClick={() => setEditingNickname(false)}
                type="button"
                variant="secondary"
              >
                取消
              </Button>
            </div>
          </form>
        ) : (
          <ProfileField
            action={
              <Button disabled={disabled} onClick={startNicknameEdit} type="button" variant="secondary">
                <Pencil size={14} />修改
              </Button>
            }
            label="昵称"
          >
            {profile.nickname || EMPTY_VALUE}
          </ProfileField>
        )}

        <ProfileField
          action={
            <Button
              disabled={disabled}
              onClick={() => {
                setUsernameError(null);
                setUsernameOpen(true);
              }}
              type="button"
              variant="secondary"
            >
              <Pencil size={14} />更改用户名
            </Button>
          }
          label="用户名"
        >
          {profile.username || EMPTY_VALUE}
        </ProfileField>

        <ProfileField
          action={
            <Button aria-label="复制用户 ID" onClick={() => void copyId()} type="button" variant="ghost">
              <Copy size={14} />
            </Button>
          }
          label="用户 ID"
          mono
        >
          {profile.id}
        </ProfileField>

        <ProfileField label="注册时间">{formatAbsoluteTime(profile.createdAt)}</ProfileField>

        <ProfileField label="账号类型">{disabled ? '开发账号' : '普通账号'}</ProfileField>
      </div>

      <Dialog onOpenChange={setUsernameOpen} open={usernameOpen} title="更改用户名">
        <form className="dialog-form" onSubmit={submitUsername}>
          <div className="form-field">
            <div className="field-header">
              <label htmlFor="profile-username">新用户名</label>
              <span className="field-hint">3-64 位字母、数字、_ 或 -</span>
            </div>
            <Input autoFocus autoComplete="username" id="profile-username" name="username" placeholder="new-username" />
          </div>
          <div className="form-field">
            <div className="field-header">
              <label htmlFor="profile-password">当前密码</label>
            </div>
            <Input autoComplete="current-password" id="profile-password" name="password" type="password" />
          </div>
          <p className="field-hint">登录名将变更，下次登录请使用新用户名。</p>
          {usernameError ? <p className="form-error" role="alert">{usernameError}</p> : null}
          <div className="dialog-actions">
            <Button onClick={() => setUsernameOpen(false)} type="button" variant="secondary">取消</Button>
            <Button disabled={updateUsername.isPending} type="submit">
              {updateUsername.isPending ? <LoaderCircle className="spin-icon" size={15} /> : null}保存
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}