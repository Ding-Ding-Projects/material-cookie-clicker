import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FileConverterScreen, type FileConverterHost } from '../src/renderer/tools/converter/FileConverterScreen.js';

const host: FileConverterHost = {
  async pickSource() { return null; },
  async pickDestination() { return null; },
  async inspect() { throw new Error('not invoked during static render'); },
  async convert() { throw new Error('not invoked during static render'); },
};

describe('categorized local converter surface', () => {
  it('renders all eight categories, an adjacent regex builder button per category, and honest disabled reasons', () => {
    const html = renderToStaticMarkup(<FileConverterScreen host={host} />);
    for (const name of ['Documents / PDF', 'Images', 'Audio', 'Video', 'Archives', 'Structured Data / Spreadsheets', 'Code / Text', 'Binary Encodings']) expect(html).toContain(name);
    expect(html.match(/Open the regex builder for/g)).toHaveLength(8);
    expect(html).toContain('No isolated offline image codec is bundled.');
    expect(html).toContain('No PATH lookup or network service is used.');
    expect(html).toContain('queue has no total item cap');
  });
});
