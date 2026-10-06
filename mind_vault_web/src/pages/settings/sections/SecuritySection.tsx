import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '../../../components/ui';
import { LogoutDialog } from '../../../features/settings/LogoutDialog';
import { useLogout } from '../../../features/settings/logout';

const SESSION_FACTS = [
  { label: '登录方式', value: '用户名 + 密码，登录成功后签发访问令牌' },
  { label: '令牌存放', value: '仅保存在本机浏览器，随每次请求的请求头携带' },
  { label: '退出影响', value: '清除本机登录状态、查询缓存与阅读偏好，服务端资料不变' },
];

/** 安全分区：说明本次会话的存放方式，并提供退出登录入口（二次确认后回到登录页）。 */
export function SecuritySection() {
  const logout = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="settings-panel">
      <div className="section-heading">
        <h2>安全</h2>
      </div>
      <p className="muted">退出当前登录，并查看本次会话与本地缓存的说明。</p>

      <div className="settings-fields">
        {SESSION_FACTS.map((fact) => (
          <div className="settings-field-row" key={fact.label}>
            <span className="settings-field-row__label">{fact.label}</span>
            <span className="settings-field-row__value">{fact.value}</span>
          </div>
        ))}
      </div>

      <div className="danger-zone">
        <div>
          <strong>退出登录</strong>
          <p className="muted">将清除本机登录状态与缓存数据；已上传的知识库内容不受影响。</p>
        </div>
        <Button className="button--danger" onClick={() => setConfirmOpen(true)} type="button" variant="secondary">
          <LogOut size={15} />
          退出登录
        </Button>
      </div>

      <LogoutDialog onConfirm={logout} onOpenChange={setConfirmOpen} open={confirmOpen} />
    </section>
  );
}