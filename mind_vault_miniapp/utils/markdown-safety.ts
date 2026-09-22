export function sanitizeMarkdown(markdown: string): string {
  let sanitized = markdown;
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(((?:javascript|data|vbscript):[^\s]+)\)/gi,
    '$1'
  );
  sanitized = sanitized.replace(
    /\[([^\]]+)\]\(((?:javascript|data|vbscript):[^\s]+)\)/gi,
    '$1'
  );
  sanitized = sanitized.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (full, alt: string, url: string) => (isSafeUrl(url) ? full : alt)
  );
  sanitized = sanitized.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (full, label: string, url: string) => (isSafeUrl(url) ? full : label)
  );
  return sanitized;
}

function isSafeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
