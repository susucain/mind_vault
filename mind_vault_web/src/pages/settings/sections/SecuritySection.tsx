/** 安全分区：退出登录与当前会话说明（阶段 G 填充内容）。 */
export function SecuritySection() {
  return (
    <section className="settings-panel">
      <div className="section-heading">
        <h2>安全</h2>
      </div>
      <p className="muted">退出当前登录，并查看本次会话与本地缓存的说明。</p>
    </section>
  );
}