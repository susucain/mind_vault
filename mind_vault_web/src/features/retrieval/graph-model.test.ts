import { describe, expect, it } from 'vitest';
import type { EntityType, GraphEdge, GraphNode, GraphView } from '@/types/domain';
import {
  GRAPH_EDGE_CAP,
  GRAPH_NODE_CAP,
  applyGraphFilters,
  emptyGraphFilters,
  incidentEdges,
  mergeGraphViews,
} from './graph-model';

function node(id: string, type: EntityType = 'TECHNOLOGY', isFocus = false): GraphNode {
  return { id, name: id, type, degree: 0, isFocus };
}

function edge(source: string, target: string, type: GraphEdge['type'] = 'RELATED_TO'): GraphEdge {
  return { id: `${source}|${type}|${target}`, source, target, type };
}

function view(focus: string, nodes: GraphNode[], edges: GraphEdge[]): GraphView {
  return { focus, nodes, edges, truncated: false };
}

describe('mergeGraphViews', () => {
  it('dedupes nodes and edges across the base view and expansions', () => {
    const base = view('A', [node('A', 'TECHNOLOGY', true), node('B', 'CONCEPT')], [edge('A', 'B')]);
    const expansion = view('B', [node('B', 'CONCEPT'), node('C', 'PROJECT')], [edge('A', 'B'), edge('B', 'C')]);

    const merged = mergeGraphViews(base, [expansion]);

    expect(merged.focus).toBe('A');
    expect(merged.nodes.map((item) => item.id).sort()).toEqual(['A', 'B', 'C']);
    expect(merged.edges).toHaveLength(2);
    expect(merged.nodes.find((item) => item.id === 'A')?.isFocus).toBe(true);
  });

  it('recomputes degree from the merged edge set', () => {
    const base = view('A', [node('A', 'TECHNOLOGY', true), node('B', 'CONCEPT')], [edge('A', 'B')]);
    const expansion = view('B', [node('B'), node('C')], [edge('B', 'C')]);

    const merged = mergeGraphViews(base, [expansion]);

    expect(merged.nodes.find((item) => item.id === 'B')?.degree).toBe(2);
    expect(merged.nodes.find((item) => item.id === 'C')?.degree).toBe(1);
  });

  it('drops edges whose endpoints are missing', () => {
    const base = view('A', [node('A', 'TECHNOLOGY', true)], [edge('A', 'ghost')]);

    const merged = mergeGraphViews(base, []);

    expect(merged.edges).toHaveLength(0);
  });

  it('caps nodes and edges and flags truncation', () => {
    const many = Array.from({ length: GRAPH_NODE_CAP + 20 }, (_, index) => node(`n${index}`));
    // 边只连在前 GRAPH_NODE_CAP 个节点之间，保证它们都会进入保留集合
    const manyEdges = Array.from({ length: GRAPH_EDGE_CAP + 50 }, (_, index) =>
      edge(`n${index % GRAPH_NODE_CAP}`, `n${(index + 1) % GRAPH_NODE_CAP}`, 'USES'),
    );
    manyEdges.forEach((item, index) => {
      item.id = `e${index}`;
    });

    const merged = mergeGraphViews(view('n0', many, manyEdges), []);

    expect(merged.nodes).toHaveLength(GRAPH_NODE_CAP);
    expect(merged.edges).toHaveLength(GRAPH_EDGE_CAP);
    expect(merged.truncated).toBe(true);
  });

  it('keeps the focus node even when it is not first in the base view', () => {
    const base = view(
      'Z',
      [node('A'), node('B'), node('Z', 'TECHNOLOGY', true)],
      [edge('A', 'Z'), edge('B', 'Z')],
    );

    const merged = mergeGraphViews(base, []);

    expect(merged.nodes[0].id).toBe('Z');
  });

  it('unions aliases carried by an expansion into the base node (G2)', () => {
    const base = view('A', [{ ...node('A', 'TECHNOLOGY', true), aliases: ['ES'] }], []);
    const expansion = view('A', [{ ...node('A', 'TECHNOLOGY'), aliases: ['ES', 'Elasticsearch'] }], []);

    const merged = mergeGraphViews(base, [expansion]);

    expect(merged.nodes[0].aliases).toEqual(['ES', 'Elasticsearch']);
  });
});

describe('applyGraphFilters', () => {
  const graph = view(
    'A',
    [node('A', 'TECHNOLOGY', true), node('B', 'CONCEPT'), node('C', 'PERSON')],
    [edge('A', 'B', 'USES'), edge('A', 'C', 'CREATED_BY'), edge('B', 'C', 'RELATED_TO')],
  );

  it('is a no-op when no filter is selected', () => {
    const filtered = applyGraphFilters(graph, emptyGraphFilters());

    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.edges).toHaveLength(3);
  });

  it('filters nodes by entity type and drops edges touching removed nodes', () => {
    const filtered = applyGraphFilters(graph, {
      entityTypes: ['TECHNOLOGY', 'CONCEPT'],
      relationTypes: [],
      showLowConfidence: false,
    });

    expect(filtered.nodes.map((item) => item.id).sort()).toEqual(['A', 'B']);
    expect(filtered.edges.map((item) => item.id)).toEqual(['A|USES|B']);
  });

  it('filters edges by relation type and recomputes degree', () => {
    const filtered = applyGraphFilters(graph, {
      entityTypes: [],
      relationTypes: ['RELATED_TO'],
      showLowConfidence: false,
    });

    expect(filtered.edges).toHaveLength(1);
    expect(filtered.nodes.find((item) => item.id === 'A')?.degree).toBe(0);
    expect(filtered.nodes.find((item) => item.id === 'B')?.degree).toBe(1);
  });

  it('hides low-confidence edges by default and shows them on demand (G4)', () => {
    const withConfidence = view(
      'A',
      [node('A', 'TECHNOLOGY', true), node('B', 'CONCEPT'), node('C', 'PERSON')],
      [
        { id: 'A|USES|B', source: 'A', target: 'B', type: 'USES', confidence: 0.8 },
        { id: 'A|CREATED_BY|C', source: 'A', target: 'C', type: 'CREATED_BY', confidence: 0.3 },
        // 历史边没有置信度，不能被默认隐藏
        { id: 'B|RELATED_TO|C', source: 'B', target: 'C', type: 'RELATED_TO' },
      ],
    );

    const hidden = applyGraphFilters(withConfidence, emptyGraphFilters());
    expect(hidden.edges.map((item) => item.id).sort()).toEqual(['A|USES|B', 'B|RELATED_TO|C']);

    const shown = applyGraphFilters(withConfidence, { ...emptyGraphFilters(), showLowConfidence: true });
    expect(shown.edges).toHaveLength(3);
  });
});

describe('incidentEdges', () => {
  it('returns edges in both directions', () => {
    const graph = view('A', [node('A'), node('B'), node('C')], [edge('A', 'B'), edge('C', 'A'), edge('B', 'C')]);

    expect(incidentEdges(graph, 'A')).toHaveLength(2);
    expect(incidentEdges(graph, 'C')).toHaveLength(2);
  });
});
