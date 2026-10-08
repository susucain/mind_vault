export interface SelectedFile {
  name: string;
  path: string;
  size: number;
}

/**
 * 选择知识文件。允许的扩展名由服务端 `/documents/supported-formats` 下发，
 * 不再在小程序侧硬编码（老格式是否可用取决于服务端 soffice）。
 */
export function chooseKnowledgeFile(
  extensions: string[]
): Promise<SelectedFile> {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: extensions.length ? extensions : undefined,
      success(result) {
        const file = result.tempFiles[0];
        if (!file) {
          reject(new Error('未选择文件'));
          return;
        }
        if (file.size > 100 * 1024 * 1024) {
          reject(new Error('文件不能超过 100MB'));
          return;
        }
        resolve({
          name: file.name,
          path: file.path,
          size: file.size,
        });
      },
      fail(error) {
        if (error.errMsg.includes('cancel')) {
          reject(new Error('已取消选择文件'));
          return;
        }
        reject(new Error(error.errMsg || '选择文件失败'));
      },
    });
  });
}
