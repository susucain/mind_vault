import { appendDocumentPage } from './document-pagination';

function expectEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

expectEqual(
  appendDocumentPage([], [{ id: 'doc_1' }], 1, 10),
  { items: [{ id: 'doc_1' }], nextPage: 2, hasMore: false },
);

expectEqual(
  appendDocumentPage([{ id: 'doc_1' }], [{ id: 'doc_1' }, { id: 'doc_2' }], 2, 10),
  { items: [{ id: 'doc_1' }, { id: 'doc_2' }], nextPage: 3, hasMore: false },
);
