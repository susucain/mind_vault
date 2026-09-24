# Library Dataset Search Design

## Goal

Keep the knowledge-library page usable with many datasets while preserving its
single-page workflow: search and switch datasets in place, upload above the
current dataset's documents, and load documents incrementally.

## Layout

- Replace the horizontal all-dataset chip strip with a compact current-dataset
  selector and a search control.
- Show recent datasets as a small secondary shortcut row only.
- Expanding the selector or search opens an in-page result panel. Selecting a
  result sets it as the current dataset and closes the panel.
- Keep the upload surface directly below the current dataset heading and above
  the document list.
- Display the current dataset document count and loaded count above the list.

## Dataset Search

- Debounce name input before calling the existing
  `GET /datasets?name=<query>&page=1&pageSize=20` endpoint.
- An empty query shows recent datasets; a non-empty query shows matching
  datasets.
- Results show dataset name and document count when available.
- The current dataset is marked in results.
- New dataset creation remains available from the selector panel and uses the
  existing creation flow.

## Document Pagination

- Request documents with `page` and `pageSize=10`.
- The initial selected dataset request loads page 1.
- The page `onReachBottom` handler loads the next page only when `hasMore` is
  true and a request is not already in flight.
- Append later pages without replacing earlier documents.
- Reset pagination when the selected dataset changes, a dataset is created, or
  a document progress event refreshes the first page.
- Keep upload, ingestion state, SSE refreshes, retries, and detail navigation
  on the same page.

## States

- Search loading and no-result states appear inside the dataset result panel.
- Document list shows a compact loading row while loading another page.
- A terminal list row indicates that all documents have been loaded.
- Failed ingestion remains actionable with the existing retry button.

## Testing

- Add pure pagination tests for reset, append, duplicate prevention, and
  `hasMore` calculation.
- Extend the dataset service query tests if a document-count field is added.
- Run miniapp TypeScript checking and the pagination test script.
