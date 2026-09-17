export enum DocumentStatus {
  /** 草稿 */
  Draft = 0,
  /** 已发布 */
  Published = 1,
  /** 已归档 */
  Archived = 2,
  /** 待审核（提交发布后、审核完成前） */
  PendingReview = 3,
}
