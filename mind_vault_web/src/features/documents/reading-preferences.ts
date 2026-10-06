import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { readStoredValue, writeStoredValue } from '../../lib/storage';

export type ReadingFontSize = 'small' | 'standard' | 'large' | 'xlarge';
export type ReadingLineHeight = 'compact' | 'standard' | 'loose';

export interface ReadingPreferences {
  fontSize: ReadingFontSize;
  lineHeight: ReadingLineHeight;
}

/** 四档字号；`standard` 为默认档，与 `:root` 上的 `--mv-reading-font-size` 取值保持一致。 */
export const READING_FONT_OPTIONS: { css: string; label: string; value: ReadingFontSize }[] = [
  { css: '0.9rem', label: '小', value: 'small' },
  { css: '1rem', label: '标准', value: 'standard' },
  { css: '1.125rem', label: '大', value: 'large' },
  { css: '1.25rem', label: '特大', value: 'xlarge' },
];

/** 三档行距；`standard` 为默认档。 */
export const READING_LINE_OPTIONS: { css: string; label: string; value: ReadingLineHeight }[] = [
  { css: '1.6', label: '紧凑', value: 'compact' },
  { css: '1.85', label: '标准', value: 'standard' },
  { css: '2.05', label: '宽松', value: 'loose' },
];

const STORAGE_KEY = 'mind-vault.reading-preferences';
const DEFAULT_PREFERENCES: ReadingPreferences = { fontSize: 'standard', lineHeight: 'standard' };

function cssOf<T extends string>(options: { css: string; value: T }[], value: T, fallback: string) {
  return options.find((option) => option.value === value)?.css ?? fallback;
}

/** 初值同步读取 localStorage，避免首屏先按默认档渲染再跳变。 */
export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(
    () => readStoredValue<ReadingPreferences>(STORAGE_KEY) ?? DEFAULT_PREFERENCES,
  );

  useEffect(() => {
    writeStoredValue(STORAGE_KEY, preferences);
  }, [preferences]);

  const update = useCallback((patch: Partial<ReadingPreferences>) => {
    setPreferences((previous) => ({ ...previous, ...patch }));
  }, []);

  return { preferences, update };
}

/** 以 CSS 变量覆盖正文排版尺度，正文样式仍由 index.css 统一消费。 */
export function readingStyle(preferences: ReadingPreferences): CSSProperties {
  return {
    '--mv-reading-font-size': cssOf(READING_FONT_OPTIONS, preferences.fontSize, '1rem'),
    '--mv-reading-line-height': cssOf(READING_LINE_OPTIONS, preferences.lineHeight, '1.85'),
  } as CSSProperties;
}
