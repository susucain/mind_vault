import { Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gfm } = require('turndown-plugin-gfm') as {
  gfm: (service: TurndownService) => void;
};
import { cleanMarkdown } from '../utils/markdown.util';
import { ImageUploader } from './pdf.parser';

const logger = new Logger('DocxParser');

export interface ParseDocxOptions {
  /**
   * 图片资产通道（A5）：提供后内嵌图片上传并写回 URL（供 A1 资产端点鉴权读取）。
   * 未提供时图片不登记，避免 mammoth 默认的 base64 data URI 把正文撑大。
   */
  uploadImage?: ImageUploader;
}

export interface ParseDocxResult {
  markdown: string;
  /** 成功登记到资产通道的图片（A5） */
  assets: Array<{ url: string }>;
  /** 抽取到的图片总数（含上传失败者），供 quality.images 使用 */
  images: number;
  /** mammoth messages 与图片上传失败（A5），供 quality.warnings 使用 */
  warnings: string[];
}

/**
 * 将 DOCX 解析为 Markdown。
 *
 * 整体流程：
 * 1. mammoth 把 DOCX 转为 HTML（保留标题 / 列表 / 表格等结构）；
 * 2. 内嵌图片经 `uploadImage` 走 A1 资产通道，写回可鉴权读取的 URL；
 * 3. turndown(+GFM) 把 HTML 转为 Markdown；
 * 4. cleanMarkdown 做换行与空白规范化。
 *
 * styleMap 同时覆盖英文与中文 Word 内置样式名，避免中文版 Word 标题丢失层级。
 */
export async function parseDocx(
  buffer: Buffer,
  options: ParseDocxOptions = {},
): Promise<ParseDocxResult> {
  const warnings: string[] = [];
  const assets: Array<{ url: string }> = [];
  let images = 0;

  // A5：图片按内容哈希命名写入 A1 资产通道；上传失败只丢该图并记 warning，不阻断整篇
  const convertImage = mammoth.images.imgElement(async (image) => {
    images += 1;
    if (!options.uploadImage) return { src: '' };
    try {
      const bytes = await image.read();
      const contentType = image.contentType || 'image/png';
      const url = await options.uploadImage(
        Buffer.from(bytes),
        `docx_img_${images}`,
        contentType,
      );
      assets.push({ url });
      return { src: url };
    } catch (error) {
      warnings.push(`第 ${images} 张图片上传失败`);
      logger.warn(
        `DOCX 图片上传失败: ${error instanceof Error ? error.message : error}`,
      );
      return { src: '' };
    }
  });

  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        // 英文样式
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        // 中文 Word 内置「标题 N」
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='标题 4'] => h4:fresh",
      ],
      convertImage,
    },
  );

  // mammoth 的 warning/error 计入 quality.warnings（A5），不再无声丢弃
  for (const message of messages) {
    warnings.push(message.message);
  }

  const turndown = new TurndownService({
    headingStyle: 'atx', // # 标题
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  // GFM：表格、删除线、任务列表等扩展语法
  turndown.use(gfm);

  // 未登记成功的图片会留成 `![]()`，清理掉避免空图占位
  const markdown = cleanMarkdown(
    turndown.turndown(html).replace(/!\[[^\]]*\]\(\)/g, ''),
  );

  return { markdown, assets, images, warnings };
}
