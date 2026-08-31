import { ParsedDocument } from '../parsed-document';

function flatten(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') {
    return [`${path}: ${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, `${path}.${key}`),
  );
}

export function parseJson(buffer: Buffer, title: string): ParsedDocument {
  const value: unknown = JSON.parse(buffer.toString('utf8'));
  const lines = flatten(value);
  const rawText = lines.join('\n');
  return {
    title,
    format: 'json',
    sections: [
      {
        sectionId: 'section_0001',
        text: rawText,
        order: 0,
        locator: { jsonPath: '$' },
      },
    ],
    assets: [],
    rawText,
  };
}
