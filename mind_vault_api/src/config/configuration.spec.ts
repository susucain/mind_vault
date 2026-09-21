import { buildConfiguration, parseBoolean } from './configuration';

describe('configuration', () => {
  it('parses boolean environment values consistently', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('FALSE')).toBe(false);
    expect(parseBoolean(undefined, true)).toBe(true);
  });

  it('maps model routing from environment variables without source defaults', () => {
    const config = buildConfiguration({
      NODE_ENV: 'test',
      PORT: '4010',
      FAST_MODEL: 'fast-from-env',
      REASONING_MODEL: 'reasoning-from-env',
      EMBEDDING_MODEL: 'embedding-from-env',
    });

    expect(config.port).toBe(4010);
    expect(config.models.fast).toBe('fast-from-env');
    expect(config.models.reasoning).toBe('reasoning-from-env');
    expect(config.models.embedding).toBe('embedding-from-env');
    expect(config.models.fastThinking).toBe(false);
  });

  it('does not supply model names when the environment is missing them', () => {
    const config = buildConfiguration({});

    expect(config.models.fast).toBeUndefined();
    expect(config.models.reasoning).toBeUndefined();
    expect(config.models.embedding).toBeUndefined();
  });
});
