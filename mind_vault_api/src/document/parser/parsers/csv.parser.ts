import { parse } from 'csv-parse/sync';
import { ParsedDocument } from '../parsed-document';

export function parseCsv(buffer: Buffer, title: string): ParsedDocument {
  const rawRecords: unknown = parse(buffer.toString('utf8'), {
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const records: string[][] = Array.isArray(rawRecords)
    ? rawRecords.map((record) =>
        Array.isArray(record)
          ? record.map((cell) =>
              typeof cell === 'string' ? cell : String(cell),
            )
          : [String(record)],
      )
    : [];
  const rawText = records
    .map((row) => row.map((cell) => String(cell)).join(' | '))
    .join('\n');
  return {
    title,
    format: 'csv',
    sections: [
      {
        sectionId: 'section_0001',
        text: rawText,
        order: 0,
        locator: {
          lineStart: 1,
          lineEnd: records.length,
        },
      },
    ],
    assets: [],
    rawText,
  };
}
