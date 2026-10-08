/**
 * A5：DOCX 内嵌图片走 A1 资产通道，mammoth messages 计入 warnings。
 * mammoth 以桩替换：只验证 convertImage 接线与警告收集，不做真实 DOCX 解析
 * （真实样本的覆盖率评测见方案 §10.3，不进 jest 扫描范围）。
 */
interface MockMammothState {
  /** HTML 模板，`{{IMAGE}}` 处按 convertImage 的返回替换 */
  html: string;
  messages: Array<{ type: string; message: string }>;
  /** 非空时触发一次 convertImage 调用 */
  image: { contentType: string; read: () => Promise<Buffer> } | null;
}

const mockMammothState: MockMammothState = {
  html: '',
  messages: [],
  image: null,
};

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: async (
      _input: unknown,
      options?: {
        convertImage?: (image: unknown) => Promise<{ src: string }>;
      },
    ) => {
      let value = mockMammothState.html;
      if (mockMammothState.image && options?.convertImage) {
        const { src } = await options.convertImage(mockMammothState.image);
        value = value.replace(
          '{{IMAGE}}',
          src ? `<img src="${src}"/>` : '<img src=""/>',
        );
      }
      return { value, messages: mockMammothState.messages };
    },
    images: { imgElement: (factory: unknown) => factory },
  },
}));

import { parseDocx } from './docx.parser';

describe('parseDocx', () => {
  beforeEach(() => {
    mockMammothState.html = '<p>正文</p>{{IMAGE}}';
    mockMammothState.messages = [];
    mockMammothState.image = null;
  });

  it('routes embedded images through the asset channel and reports counts', async () => {
    mockMammothState.image = {
      contentType: 'image/png',
      read: () => Promise.resolve(Buffer.from('image-bytes')),
    };
    const uploaded: Array<{ fileName: string; contentType: string }> = [];
    const uploadImage = (
      _bytes: Buffer,
      fileName: string,
      contentType: string,
    ) => {
      uploaded.push({ fileName, contentType });
      return Promise.resolve('documents/user_1/doc_1/abc123.png');
    };

    const result = await parseDocx(Buffer.from('docx'), { uploadImage });

    expect(uploaded).toEqual([
      { fileName: 'docx_img_1', contentType: 'image/png' },
    ]);
    expect(result.images).toBe(1);
    expect(result.assets).toEqual([
      { url: 'documents/user_1/doc_1/abc123.png' },
    ]);
    expect(result.markdown).toContain('![](documents/user_1/doc_1/abc123.png)');
    expect(result.warnings).toEqual([]);
  });

  it('collects mammoth messages into warnings', async () => {
    mockMammothState.messages = [
      { type: 'warning', message: '未识别的样式：自定义标题' },
    ];

    const result = await parseDocx(Buffer.from('docx'));

    expect(result.warnings).toEqual(['未识别的样式：自定义标题']);
    expect(result.images).toBe(0);
  });

  it('drops the image and records a warning when upload fails', async () => {
    mockMammothState.image = {
      contentType: 'image/jpeg',
      read: () => Promise.resolve(Buffer.from('image-bytes')),
    };
    const uploadImage = () => Promise.reject<string>(new Error('storage down'));

    const result = await parseDocx(Buffer.from('docx'), { uploadImage });

    expect(result.assets).toEqual([]);
    expect(result.images).toBe(1);
    expect(result.warnings).toEqual(['第 1 张图片上传失败']);
    // 未登记成功不留空图占位
    expect(result.markdown).not.toContain('![]()');
  });
});
