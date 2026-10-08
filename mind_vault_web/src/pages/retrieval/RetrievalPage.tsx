import { useCallback, useEffect, useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchHistoryEntry } from '@/types/domain';
import { APP_PATHS } from '@/app/navigation';
import { Button, Drawer, EmptyState, ErrorState } from '@/components/ui';
import { documentPreviewPath } from '@/features/documents/document-utils';
import { useDatasets } from '@/features/documents/queries';
import { AdvancedOptions } from '@/features/retrieval/components/AdvancedOptions';
import { DatasetMultiSelect } from '@/features/retrieval/components/DatasetMultiSelect';
import { EntitySuggestInput } from '@/features/retrieval/components/EntitySuggestInput';
import { GraphPanel } from '@/features/retrieval/components/GraphPanel';
import { HistoryPopover } from '@/features/retrieval/components/HistoryPopover';
import { MODE_HINT, MODE_PLACEHOLDER } from '@/features/retrieval/mode-meta';
import { ModeTabs } from '@/features/retrieval/components/ModeTabs';
import { ResultList } from '@/features/retrieval/components/ResultList';
import { ResultsStatsBar } from '@/features/retrieval/components/ResultsStatsBar';
import { SearchBar } from '@/features/retrieval/components/SearchBar';
import {
  useClearSearchHistory,
  useDeleteSearchHistory,
  useEntitySuggestions,
  useSearchHistory,
  useSearchResults,
} from '@/features/retrieval/queries';
import {
  parseRetrievalParams,
  serializeRetrievalParams,
  stateFromHistoryEntry,
  type RetrievalQueryState,
} from '@/features/retrieval/retrieval-schema';
import { useGraphExploration } from '@/features/retrieval/use-graph-exploration';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/** 与设计方案 4.5.4 一致：< 1100px 时图谱区收起为抽屉。 */
const COMPACT_QUERY = '(max-width: 1099px)';

function ResultSkeleton() {
  return (
    <div aria-hidden="true" className="retrieval-skeleton">
      {[0, 1, 2].map((key) => (
        <div className="retrieval-card retrieval-card--skeleton" key={key} />
      ))}
    </div>
  );
}

export function RetrievalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const state = useMemo(() => parseRetrievalParams(searchParams), [searchParams]);
  const [draft, setDraft] = useState(state.query);
  const [graphHidden, setGraphHidden] = useState(false);
  const [graphDrawerOpen, setGraphDrawerOpen] = useState(false);
  const compactGraph = useMediaQuery(COMPACT_QUERY);

  const updateState = useCallback(
    (patch: Partial<RetrievalQueryState>, replace = false) => {
      // 只提交显式给出的条件；检索词仅在点击检索按钮（或选择历史/实体）时才写入。
      setSearchParams(serializeRetrievalParams({ ...state, ...patch }), { replace });
    },
    [state, setSearchParams],
  );

  // URL 是查询条件的唯一真源；外部变化（前进后退、历史回填）需回写输入草稿。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(state.query);
  }, [state.query]);

  const datasets = useDatasets().data?.items ?? [];
  const history = useSearchHistory();
  const deleteHistory = useDeleteSearchHistory();
  const clearHistory = useClearSearchHistory();

  const search = useSearchResults(state);
  const items = useMemo(() => search.data?.pages.flatMap((page) => page.items) ?? [], [search.data]);
  const firstPage = search.data?.pages[0];
  const hasQuery = state.query.length > 0;
  const showSkeleton = hasQuery && search.isPending;

  const isGraphMode = state.mode === 'graph';
  const exploration = useGraphExploration({
    enabled: isGraphMode,
    focus: state.query,
    maxHops: state.maxHops,
    datasetIds: state.datasetIds,
  });

  // 语料级信号：一条实体都查不到，说明文档还没建图谱；用于把空态从「没匹配」换成「去构建图谱」。
  // 查询失败时保持 undefined（不解释），避免把网络问题误报成「没建图谱」。
  const graphCorpus = useEntitySuggestions({ enabled: isGraphMode, q: '', allowEmpty: true, limit: 1 });
  const hasGraphData = graphCorpus.isSuccess ? (graphCorpus.data?.items.length ?? 0) > 0 : undefined;

  // 关系证据指向命中的 chunk：由检索结果反查原文深链，供节点详情跳转。
  const evidencePaths = useMemo(
    () => new Map(items.map((item) => [item.chunkId, documentPreviewPath(item.documentId, item.locator)])),
    [items],
  );

  const selectHistory = (entry: SearchHistoryEntry) => {
    setSearchParams(serializeRetrievalParams(stateFromHistoryEntry(entry)));
  };

  const pickEntity = (entity: string) => {
    setDraft(entity);
    updateState({ query: entity });
  };

  const output = !hasQuery ? (
    <EmptyState
      description="输入关键词或一句话描述你想找的内容，切换上方方式可获得不同排序。"
      title="开始一次检索"
    />
  ) : showSkeleton ? (
    <>
      <ResultsStatsBar bySource={{}} loading mode={state.mode} tookMs={0} total={0} />
      <ResultSkeleton />
    </>
  ) : search.isError ? (
    <ErrorState onRetry={() => void search.refetch()} title="检索失败，请稍后重试" />
  ) : items.length === 0 ? (
    <EmptyState description="换个说法、去掉时间范围或扩大资料集范围后再试。" title="没有找到相关内容" />
  ) : (
    <>
      <ResultsStatsBar
        bySource={firstPage?.stats.bySource ?? {}}
        mode={state.mode}
        tookMs={firstPage?.tookMs ?? 0}
        total={firstPage?.total ?? 0}
        truncated={firstPage?.truncated}
      />
      <ResultList
        hasNext={Boolean(search.hasNextPage)}
        isFetchingNextPage={search.isFetchingNextPage}
        items={items}
        onLoadMore={() => void search.fetchNextPage()}
      />
    </>
  );

  return (
    <section className={cn('page-section', 'retrieval-page', isGraphMode && 'retrieval-page--graph')}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">检索</p>
          <h1>统一检索</h1>
          <p className="muted">跨资料的关键字、语义与图谱检索，命中片段可直接跳转原文。</p>
        </div>
      </div>

      <div className="workspace-panel retrieval-panel">
        <div className="retrieval-panel__modes">
          <ModeTabs onChange={(mode) => updateState({ mode })} value={state.mode} />
          <div className="retrieval-panel__actions">
            {isGraphMode ? (
              <Button
                onClick={() => (compactGraph ? setGraphDrawerOpen(true) : setGraphHidden((prev) => !prev))}
                variant="secondary"
              >
                <Network aria-hidden="true" size={15} />
                {compactGraph ? '查看图谱' : graphHidden ? '展开图谱' : '收起图谱'}
              </Button>
            ) : null}
            <DatasetMultiSelect
              datasets={datasets}
              onChange={(datasetIds) => updateState({ datasetIds })}
              value={state.datasetIds}
            />
            <AdvancedOptions onChange={(patch) => updateState(patch)} state={state} />
            <HistoryPopover
              clearing={clearHistory.isPending}
              entries={history.data?.items ?? []}
              isLoading={history.isLoading}
              onClear={() => clearHistory.mutate()}
              onDelete={(id) => deleteHistory.mutate(id)}
              onSelect={selectHistory}
            />
          </div>
        </div>

        <SearchBar
          busy={search.isFetching && !search.isFetchingNextPage}
          hint={MODE_HINT[state.mode]}
          onChange={setDraft}
          onSubmit={() => updateState({ query: draft })}
          placeholder={MODE_PLACEHOLDER[state.mode]}
          value={draft}
        />

        <EntitySuggestInput enabled={isGraphMode} onPick={pickEntity} value={draft} />
      </div>

      {isGraphMode && !compactGraph ? (
        <div className={cn('retrieval-body', !graphHidden && 'retrieval-body--split')}>
          <div className="retrieval-output">{output}</div>
          {graphHidden ? null : (
            <aside className="retrieval-graph">
              <GraphPanel
                evidencePaths={evidencePaths}
                exploration={exploration}
                hasGraphData={hasGraphData}
                onBuildGraph={() => navigate(APP_PATHS.library)}
                onCollapse={() => setGraphHidden(true)}
              />
            </aside>
          )}
        </div>
      ) : (
        <div className="retrieval-output">{output}</div>
      )}

      {isGraphMode && compactGraph ? (
        <Drawer onOpenChange={setGraphDrawerOpen} open={graphDrawerOpen} side="bottom" title="知识图谱">
          <div className="retrieval-graph-drawer">
            <GraphPanel
              collapseLabel="关闭"
              evidencePaths={evidencePaths}
              exploration={exploration}
              hasGraphData={hasGraphData}
              onBuildGraph={() => navigate(APP_PATHS.library)}
              onCollapse={() => setGraphDrawerOpen(false)}
            />
          </div>
        </Drawer>
      ) : null}
    </section>
  );
}
