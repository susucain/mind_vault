/**
 * 上传文件头签名（魔数）核对（U1/F8）。
 *
 * 治「改扩展名伪装」：只扩展名校验时，`.txt` 实为压缩包/exe 会一路通过上传，
 * 直到摄取阶段才报错。这里在**接收完文件后、落库前**做一次低成本的魔数比对。
 *
 * 定位是「防呆」而非「防恶意」：只核对文件头，不解析文件结构，也不做完整扫描。
 */

/** 与扩展名不符时返回给前端的错误码 */
export const FILE_TYPE_MISMATCH = 'FILE_TYPE_MISMATCH';

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
/** docx / xlsx / pptx 均为 ZIP 容器（Local File Header 签名） */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** 老 Office 复合文档（OLE2）签名 */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const PDF_EXTENSIONS = new Set(['pdf']);
const ZIP_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx']);
const OLE_EXTENSIONS = new Set(['doc', 'xls', 'ppt']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json']);

const TEXT_SAMPLE_BYTES = 64 * 1024;

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return (
    buffer.length >= magic.length &&
    buffer.subarray(0, magic.length).equals(magic)
  );
}

/**
 * 文本类判定：无 NUL 字节，且采样可按 UTF-8 解码。
 * 采样末尾可能被截断在多字节字符中间，去掉尾部 1–3 字节再试，避免把正常文件误判为二进制。
 */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, TEXT_SAMPLE_BYTES));
  if (sample.includes(0)) return false;
  for (let trim = 0; trim <= 3 && trim < sample.length; trim += 1) {
    const candidate =
      trim === 0 ? sample : sample.subarray(0, sample.length - trim);
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(candidate);
      return true;
    } catch {
      // 截断在多字节字符中间才会失败，继续尝试更短的样本
    }
  }
  return false;
}

/** 文件头是否与扩展名匹配；未知扩展名放行（由扩展名白名单负责）。 */
export function matchesFileSignature(
  extension: string,
  buffer: Buffer,
): boolean {
  const ext = extension?.toLowerCase();
  if (PDF_EXTENSIONS.has(ext)) return startsWith(buffer, PDF_MAGIC);
  if (ZIP_EXTENSIONS.has(ext)) return startsWith(buffer, ZIP_MAGIC);
  if (OLE_EXTENSIONS.has(ext)) return startsWith(buffer, OLE_MAGIC);
  if (TEXT_EXTENSIONS.has(ext)) return looksLikeText(buffer);
  return true;
}
