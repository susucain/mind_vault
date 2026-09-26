import {
  appendReviewPage,
  hasMoreReviewItems,
  reviewScoreLabel,
} from './review-state';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

expectEqual(
  appendReviewPage(
    [{ id: 'review_1' }],
    [{ id: 'review_1' }, { id: 'review_2' }]
  ),
  [{ id: 'review_1' }, { id: 'review_2' }],
  'appends a later page without duplicating review items'
);
expectEqual(
  appendReviewPage([], [{ id: 'review_3' }]),
  [{ id: 'review_3' }],
  'appends into an empty list'
);
expectEqual(
  appendReviewPage([{ id: 'review_1' }], []),
  [{ id: 'review_1' }],
  'keeps the current list when the next page is empty'
);

expectEqual(hasMoreReviewItems(20, 20), false, 'stops at the total');
expectEqual(hasMoreReviewItems(19, 20), true, 'keeps loading below the total');
expectEqual(hasMoreReviewItems(0, 0), false, 'stops when there is nothing');

expectEqual(reviewScoreLabel(60), '60 分', 'labels a passing score');
expectEqual(reviewScoreLabel(59.5), '60 分', 'rounds a score to integer');
expectEqual(reviewScoreLabel(null), '未评分', 'labels a missing score');
expectEqual(reviewScoreLabel(undefined), '未评分', 'labels an absent score');

console.log('review state tests passed');
