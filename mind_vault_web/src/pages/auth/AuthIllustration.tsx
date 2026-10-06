/** 登录页左侧插画：打开的笔记本 + 漂浮的知识节点（内联 SVG，随 currentColor 换色） */
export function AuthIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="auth-illustration"
      fill="none"
      role="img"
      viewBox="0 0 320 220"
    >
      <defs>
        <linearGradient id="auth-illustration-page" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* 漂浮的小圆点（知识节点） */}
      <g fill="currentColor">
        <circle cx="58" cy="56" r="3.2" opacity="0.5" />
        <circle cx="276" cy="44" r="2.4" opacity="0.4" />
        <circle cx="300" cy="138" r="2.8" opacity="0.45" />
        <circle cx="40" cy="158" r="2.2" opacity="0.35" />
      </g>

      {/* 连接线 */}
      <g stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.2" strokeLinecap="round">
        <path d="M61 56 L96 74" />
        <path d="M273 46 L244 70" />
        <path d="M298 138 L268 120" />
      </g>

      {/* 打开的笔记本 */}
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        transform="rotate(-4 160 120)"
      >
        {/* 左页 */}
        <path d="M160 70 L62 82 L62 178 L160 166 Z" fill="url(#auth-illustration-page)" />
        {/* 右页 */}
        <path d="M160 70 L258 82 L258 178 L160 166 Z" fill="url(#auth-illustration-page)" />
        {/* 书脊 */}
        <line x1="160" y1="70" x2="160" y2="166" />

        {/* 左页文字行 */}
        <g strokeOpacity="0.4">
          <line x1="78" y1="104" x2="142" y2="98" />
          <line x1="78" y1="120" x2="134" y2="115" />
          <line x1="78" y1="136" x2="146" y2="131" />
          <line x1="78" y1="152" x2="120" y2="148" />
        </g>

        {/* 右页：一个高亮的知识卡片 */}
        <rect x="178" y="100" width="64" height="46" rx="5" fill="currentColor" fillOpacity="0.08" />
        <line x1="188" y1="114" x2="230" y2="114" strokeOpacity="0.55" />
        <line x1="188" y1="126" x2="222" y2="126" strokeOpacity="0.4" />
        <line x1="188" y1="136" x2="214" y2="136" strokeOpacity="0.3" />

        {/* 右上角小书签 */}
        <path d="M240 82 L240 98 L248 92 L256 98 L256 82 Z" fill="currentColor" fillOpacity="0.15" />
      </g>

      {/* 琥珀色点缀：一颗小星星 */}
      <g fill="#c47a2b" transform="translate(248 52)">
        <path d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4 Z" opacity="0.85" />
      </g>
    </svg>
  );
}