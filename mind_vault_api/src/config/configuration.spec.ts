import { buildConfiguration, parseBoolean } from './configuration';

describe('configuration', () => {
  it('parses boolean environment values consistently', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('FALSE')).toBe(false);
    expect(parseBoolean(undefined, true)).toBe(true);
  });

  it('exposes model routing and infrastructure defaults', () => {
    const config = buildConfiguration({
      NODE_ENV: 'test',
      PORT: '4010',
    });

    expect(config.port).toBe(4010);
    expect(config.models.fast).toBe('qwen3.8-flash');
    expect(config.models.reasoning).toBe('deepseek-v4-flash-0731');
    expect(config.models.embedding).toBe('qwen3.7-text-embedding');
    expect(config.models.fastThinking).toBe(false);
  });
});
