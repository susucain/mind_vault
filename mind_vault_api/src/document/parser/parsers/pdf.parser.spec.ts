/**
 * A4：PDF 表格按页码并入对应页正文。
 * pdf-parse 以桩替换，只验证表格归位与分页口径，不做真实 PDF 解析
 * （真实样本的准确率评测见方案 §10.3，不进 jest 扫描范围）。
 */
interface MockPdfState {
  text: unknown;
  image: unknown;
  table: unknown;
}

const mockPdfState: MockPdfState = {
  text: undefined,
  image: undefined,
  table: undefined,
};

jest.mock('pdf-parse', () => ({
  PDFParse: class {
    getText() {
      return Promise.resolve(mockPdfState.text);
    }
    getImage() {
      return Promise.resolve(mockPdfState.image);
    }
    getTable() {
      return Promise.resolve(mockPdfState.table);
    }
    destroy() {
      return Promise.resolve();
    }
  },
}));

import { parsePdfDocument } from './pdf.parser';

describe('parsePdfDocument', () => {
  beforeEach(() => {
    mockPdfState.text = undefined;
    mockPdfState.image = undefined;
    mockPdfState.table = undefined;
  });

  it('merges each page table into that page section instead of a trailing appendix', async () => {
    mockPdfState.text = {
      pages: [
        { num: 1, text: '第一页正文' },
        { num: 2, text: '第二页正文' },
      ],
    };
    mockPdfState.table = {
      pages: [
        {
          num: 1,
          tables: [
            [
              ['A', 'B'],
              ['1', '2'],
            ],
          ],
        },
        {
          num: 2,
          tables: [
            [
              ['C', 'D'],
              ['3', '4'],
            ],
          ],
        },
      ],
    };

    const result = await parsePdfDocument(Buffer.from('pdf'), 'guide.pdf');

    expect(result.quality.tables).toBe(2);
    expect(result.sections).toHaveLength(2);

    // 每页正文各自携带本页表格
    expect(result.sections[0].text).toContain('第一页正文');
    expect(result.sections[0].text).toContain('| A | B |');
    expect(result.sections[1].text).toContain('第二页正文');
    expect(result.sections[1].text).toContain('| C | D |');

    // 不再有文末汇总章节，也不会把第 2 页表格塞进第 1 页
    expect(result.rawText).not.toContain('## 检测到的表格');
    expect(result.sections[0].text).not.toContain('| C | D |');
  });

  it('skips a page table when that page already carries a markdown table', async () => {
    mockPdfState.text = {
      pages: [
        { num: 1, text: '已有表格\n\n| x | y |\n| --- | --- |\n| 1 | 2 |' },
      ],
    };
    mockPdfState.table = {
      pages: [
        {
          num: 1,
          tables: [
            [
              ['A', 'B'],
              ['1', '2'],
            ],
          ],
        },
      ],
    };

    const result = await parsePdfDocument(Buffer.from('pdf'), 'guide.pdf');

    // tables 记录「检出」数，即便该页已有表格而未重复并入
    expect(result.quality.tables).toBe(1);
    expect(result.sections[0].text).toContain('| x | y |');
    expect(result.sections[0].text).not.toContain('| A | B |');
  });

  it('keeps the trailing appendix only when tables carry no page number', async () => {
    mockPdfState.text = { pages: [{ num: 1, text: '正文' }] };
    mockPdfState.table = {
      pages: [
        {
          tables: [
            [
              ['A', 'B'],
              ['1', '2'],
            ],
          ],
        },
      ],
    };

    const result = await parsePdfDocument(Buffer.from('pdf'), 'guide.pdf');

    expect(result.quality.tables).toBe(1);
    expect(result.rawText).toContain('## 检测到的表格');
    expect(result.rawText).toContain('| A | B |');
  });

  it('discards empty layout grids misdetected as tables', async () => {
    mockPdfState.text = {
      pages: [
        { num: 1, text: '简历正文' },
        { num: 2, text: '项目经历' },
      ],
    };
    mockPdfState.table = {
      pages: [
        {
          num: 1,
          tables: [
            [[''], ['']],
            [
              ['', '', ''],
              ['', '', ''],
            ],
          ],
        },
        {
          num: 2,
          tables: [
            [
              [' ', '\n'],
              ['\t', ''],
            ],
          ],
        },
      ],
    };

    const result = await parsePdfDocument(Buffer.from('pdf'), 'resume.pdf');

    expect(result.quality.tables).toBe(0);
    expect(result.rawText).toContain('简历正文');
    expect(result.rawText).toContain('项目经历');
    expect(result.rawText).not.toContain('### 表格');
  });
});
