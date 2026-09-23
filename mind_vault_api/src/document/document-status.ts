export enum DocumentStatus {
  /** 主索引任务排队或处理中 */
  Processing = 0,
  /** 主索引已完成，文档可问答 */
  Available = 1,
  /** 保留但不参与检索 */
  Archived = 2,
  /** 最近一次主索引失败 */
  Failed = 3,
}
