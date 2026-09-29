import type { DocumentLocator } from '../../types/domain';

export function DocumentLocatorView({ locator }: { locator: DocumentLocator }) {
  const parts = [
    locator.page !== undefined ? `第 ${locator.page} 页` : undefined,
    locator.slide !== undefined ? `第 ${locator.slide} 张幻灯片` : undefined,
    locator.sheet ? `工作表 ${locator.sheet}${locator.cellRange ? ` · ${locator.cellRange}` : ''}` : locator.cellRange,
    locator.lineStart !== undefined
      ? `第 ${locator.lineStart}${locator.lineEnd !== undefined ? `–${locator.lineEnd}` : ''} 行`
      : undefined,
    locator.jsonPath ? `JSON ${locator.jsonPath}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="locator-list" aria-label="原文位置">
      {parts.length ? parts.map((part) => <span key={part}>{part}</span>) : <span>全文</span>}
    </div>
  );
}
