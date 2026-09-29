import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(`${process.cwd()}/src/styles/index.css`, 'utf8');

describe('mobile drawer styles', () => {
  it('clears the right drawer top offset before pinning the sheet to the bottom edge', () => {
    expect(styles).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.drawer-content\[data-side="right"\][\s\S]*?top: auto;[\s\S]*?bottom: 0;/,
    );
  });
});
