import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(`${process.cwd()}/src/styles/index.css`, 'utf8');

describe('mobile drawer styles', () => {
  it('clears the right drawer top offset before pinning the sheet to the bottom edge', () => {
    expect(styles).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.drawer-content\[data-side="right"\][\s\S]*?top: auto;[\s\S]*?bottom: 0;/,
    );
  });

  it('keeps overlay and content above the mobile navigation and makes sheet content scrollable', () => {
    expect(styles).toMatch(/\.drawer-overlay\s*\{[^}]*z-index:\s*40;/);
    expect(styles).toMatch(/\.drawer-content\s*\{[^}]*z-index:\s*50;[^}]*overflow-y:\s*auto;/);
  });

  it('keeps dialog overlay and content above the mobile navigation', () => {
    expect(styles).toMatch(/\.dialog-overlay\s*\{[^}]*z-index:\s*40;/);
    expect(styles).toMatch(/\.dialog-content\s*\{[^}]*z-index:\s*50;/);
  });
});
