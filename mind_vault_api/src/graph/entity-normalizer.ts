/**
 * 实体名归一规则层（G2）。目标是把「同一实体的不同写法」收敛到同一个
 * `normalizedName`，从而在 Neo4j 里合并为一个节点。全规则零额外成本、
 * 纯函数、可单测；模型层同义判定按 D11 暂不启用。
 *
 * 规则顺序很关键：先做 NFKC（全半角/兼容字符统一），后续规则才只需处理半角形态。
 */

/** 首尾引号（NFKC 后中英文引号仍可能保留，如「」『』《》） */
const LEADING_QUOTE = /^["'`「『《【]+/;
const TRAILING_QUOTE = /["'`」』》】]+$/;
/** 括号注释：NFKC 已把中文括号转半角，只需处理 () 与 [] */
const BRACKET_COMMENT = /[([][^()[\]]*[\])]/g;
/** 英文连字符与下划线：统一为空格，使 `mind_vault` 与 `mind-vault` 归一 */
const HYPHEN_UNDERSCORE = /[-_]+/g;
/** 尾标点：中英文句读（。与 . 都在内） */
const TRAILING_PUNCTUATION = /[。，、；：！？,.、;:!?]+$/u;
/**
 * 保守复数：只处理「辅音 + s」结尾的 ASCII 词，且长度 ≥4。
 * 保护 ss/us/is/es 结尾（class、status、analysis、services、Kubernetes），
 * 宁可漏合并也不误伤专名。
 */
const TRAILING_PLURAL = /\b([A-Za-z]{4,})s\b/g;
const PROTECTED_ENDINGS = ['ss', 'us', 'is', 'es'];

export function normalizeEntityName(value: string): string {
  if (!value) return '';
  let text = value.normalize('NFKC').trim();
  text = text.replace(LEADING_QUOTE, '').replace(TRAILING_QUOTE, '');
  text = text.replace(BRACKET_COMMENT, '');
  text = text.replace(HYPHEN_UNDERSCORE, ' ');
  text = text.replace(TRAILING_PUNCTUATION, '');
  text = text.replace(TRAILING_PLURAL, (match) => {
    const lower = match.toLowerCase();
    return PROTECTED_ENDINGS.some((ending) => lower.endsWith(ending))
      ? match
      : match.slice(0, -1);
  });
  return text.toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}
