const allowedExtensions = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'txt',
  'md',
  'csv',
  'json',
];

export interface SelectedFile {
  name: string;
  path: string;
  size: number;
}

export function chooseKnowledgeFile(): Promise<SelectedFile> {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: allowedExtensions,
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
