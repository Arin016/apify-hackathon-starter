import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export function extractEvidence(html: string, url: string, synthetic: boolean) {
  const $ = load(html);
  $('script, style, nav, footer, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000);
  return {
    sourceUrl: url,
    retrievedAt: new Date().toISOString(),
    synthetic,
    title: $('title').text().trim(),
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
  };
}

// A model's evidence quote must be an exact substring of fetched source text.
// This checks provenance, not whether the model interpreted the quote correctly.
export function quoteExists(quote: string, sourceText: string) {
  return quote.trim().length > 0 && sourceText.includes(quote);
}
