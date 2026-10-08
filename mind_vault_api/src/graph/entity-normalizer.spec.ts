import { normalizeEntityName } from './entity-normalizer';

describe('normalizeEntityName', () => {
  it('unifies full-width and half-width forms with NFKC', () => {
    expect(normalizeEntityName('Ｋａｆｋａ')).toBe('kafka');
  });

  it('trims, lowercases and collapses inner whitespace', () => {
    expect(normalizeEntityName('  Kafka   Streams  ')).toBe('kafka stream');
    expect(normalizeEntityName('   ')).toBe('');
    expect(normalizeEntityName('')).toBe('');
  });

  it('strips surrounding quotes and bracket comments', () => {
    expect(normalizeEntityName('「Kafka」')).toBe('kafka');
    expect(normalizeEntityName('"消息队列"')).toBe('消息队列');
    expect(normalizeEntityName('Elasticsearch (ES)')).toBe('elasticsearch');
    expect(normalizeEntityName('Neo4j [图数据库]')).toBe('neo4j');
  });

  it('treats hyphen and underscore as equivalent separators', () => {
    expect(normalizeEntityName('mind_vault')).toBe('mind vault');
    expect(normalizeEntityName('mind-vault')).toBe('mind vault');
  });

  it('drops trailing punctuation', () => {
    expect(normalizeEntityName('Kafka。')).toBe('kafka');
    expect(normalizeEntityName('消息队列,')).toBe('消息队列');
  });

  it('collapses an obvious trailing plural but protects tricky endings', () => {
    expect(normalizeEntityName('vectors')).toBe('vector');
    // ss / us / is / es 结尾多为专名或不可数词，保守保留
    expect(normalizeEntityName('class')).toBe('class');
    expect(normalizeEntityName('status')).toBe('status');
    expect(normalizeEntityName('analysis')).toBe('analysis');
    expect(normalizeEntityName('Kubernetes')).toBe('kubernetes');
    expect(normalizeEntityName('services')).toBe('services');
  });
});
