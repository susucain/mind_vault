import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentLocatorView } from './DocumentLocator';

describe('DocumentLocatorView', () => {
  it('renders every supported locator type', () => {
    render(
      <DocumentLocatorView
        locator={{
          page: 4,
          slide: 7,
          sheet: 'Q3',
          cellRange: 'B2:D8',
          lineStart: 12,
          lineEnd: 19,
          jsonPath: '$.projects[0].name',
        }}
      />,
    );

    expect(screen.getByText('第 4 页')).toBeInTheDocument();
    expect(screen.getByText('第 7 张幻灯片')).toBeInTheDocument();
    expect(screen.getByText('工作表 Q3 · B2:D8')).toBeInTheDocument();
    expect(screen.getByText('第 12–19 行')).toBeInTheDocument();
    expect(screen.getByText('JSON $.projects[0].name')).toBeInTheDocument();
  });
});
