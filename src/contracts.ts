import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SEARCH = 'apify/google-search-scraper';
export const CRAWLER = 'apify/website-content-crawler';
export const Input = z.object({
  mode: z.enum(['plan', 'execute']).default('plan'),
  goal: z.string().trim().min(8).max(1500),
  actorIds: z.array(z.enum([SEARCH, CRAWLER])).max(2).default([]),
  query: z.string().trim().max(300).default(''),
  startUrls: z.array(z.string().url()).max(3).default([]),
  maxPages: z.number().int().min(1).max(3).default(1),
  maxStepSeconds: z.number().int().min(30).max(120).default(90),
  testBudgetUsd: z.number().min(0.1).max(2).default(1),
  planner: z.enum(['deepseek', 'fixed']).default('deepseek'),
  generatedName: z.string().regex(/^[a-z][a-z0-9-]{2,49}$/).default('composed-research-workflow'),
}).strict();
export type ComposerInput = z.infer<typeof Input>;
export const Draft = z.object({
  status: z.enum(['ready', 'needs_clarification', 'unsupported']),
  recipe: z.enum(['search_brief', 'website_brief']).nullable(),
  title: z.string().min(3).max(100),
  searchQuery: z.string().max(300).nullable(),
  questions: z.array(z.string().max(300)).max(3),
}).strict();
export type DraftPlan = z.infer<typeof Draft>;
export type Contract = { actorId: string; buildId: string; buildNumber: string; schemaHash: string; schema: Record<string, any>; pricingModel: string };
export type Plan = { version: 1; recipe: 'search_brief' | 'website_brief'; title: string; goal: string; query: string; actorIds: string[]; steps: { id: string; actorId: string; mapping: string }[] };
export type Source = { url: string; title: string; text: string };
export const Brief = z.object({ claims: z.array(z.object({ sourceUrl: z.string().url(), quote: z.string().min(8).max(500), finding: z.string().min(3).max(600) }).strict()).min(1).max(3), limitations: z.array(z.string().max(300)).max(5) }).strict();
export type BriefResult = z.infer<typeof Brief>;
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function compile(input: ComposerInput, draft: DraftPlan): Plan {
  if (draft.status !== 'ready' || !draft.recipe || draft.questions.length) throw new Error(`PLAN_NOT_READY: ${draft.questions.join(' ') || draft.status}`);
  const actorIds = draft.recipe === 'search_brief' ? [SEARCH, CRAWLER] : [CRAWLER];
  if (new Set(input.actorIds).size !== input.actorIds.length) throw new Error('Duplicate Actor selections');
  if (input.actorIds.length && (input.actorIds.length !== actorIds.length || input.actorIds.some(id => !actorIds.includes(id)))) throw new Error('Selected Actors do not match the supported recipe');
  const query = input.query || draft.searchQuery || '';
  if (draft.recipe === 'search_brief' && input.testBudgetUsd < 1) throw new Error('Search recipe needs a PPE allocation of at least $1: Google Search requires its maximum-cost setting to be at least $0.50. This is a ceiling, not an upfront charge.');
  if (draft.recipe === 'search_brief' && !query) throw new Error('Search recipe requires a query');
  if (draft.recipe === 'website_brief' && !input.startUrls.length) throw new Error('Website recipe requires startUrls');
  return { version: 1, recipe: draft.recipe, title: draft.title, goal: input.goal, query, actorIds,
    steps: [...(draft.recipe === 'search_brief' ? [{ id: 'discover', actorId: SEARCH, mapping: 'query -> queries; organicResults[].url -> extract.startUrls[].url' }] : []),
      { id: 'extract', actorId: CRAWLER, mapping: draft.recipe === 'search_brief' ? 'discover.organicResults[].url -> startUrls[].url' : 'input.startUrls[] -> startUrls[].url' },
      { id: 'brief', actorId: 'apify/openrouter', mapping: 'extract.text|markdown -> bounded evidence context -> validated claims[]' }] };
}
export function assertPlan(plan: Plan, input: ComposerInput) {
  const rebuilt = compile(input, { status: 'ready', recipe: plan.recipe, title: plan.title, searchQuery: plan.query, questions: [] });
  if (hash(rebuilt) !== hash(plan)) throw new Error('Workflow plan is not the deterministic compiler output');
}
export function searchInput(plan: Plan) { return { queries: plan.query, maxPagesPerQuery: 1, countryCode: 'us', languageCode: 'en', saveHtml: false, includeUnfilteredResults: false }; }
export function crawlInput(urls: string[], input: ComposerInput) { return { startUrls: urls.map(url => ({ url })), crawlerType: 'cheerio', maxCrawlDepth: 0, maxCrawlPages: input.maxPages, maxResults: input.maxPages, maxConcurrency: 1, requestTimeoutSecs: 25, respectRobotsTxtFile: true, saveMarkdown: true, saveHtml: false, proxyConfiguration: { useApifyProxy: true } }; }
export function searchUrls(items: Record<string, any>[], limit: number) {
  return [...new Set(items.flatMap(item => Array.isArray(item.organicResults) ? item.organicResults.map((r: any) => r?.url).filter((url: unknown): url is string => typeof url === 'string') : []))].slice(0, limit);
}
export function sourcesFrom(items: Record<string, any>[], limit: number): Source[] {
  return items.slice(0, limit).map(item => ({ url: String(item.url ?? ''), title: String(item.metadata?.title ?? item.title ?? ''), text: String(item.text || item.markdown || '').replace(/\s+/g, ' ').trim().slice(0, Math.floor(12000 / limit)) })).filter(s => s.url && s.text.length >= 30);
}
export function verifyBrief(brief: BriefResult, sources: Source[]) {
  for (const claim of brief.claims) {
    const source = sources.find(s => s.url === claim.sourceUrl);
    if (!source || !source.text.includes(claim.quote)) throw new Error('EVIDENCE_GATE_FAILED: source URL or exact quote not found');
  }
}
export function confidence(checks: { contracts: boolean; plan: boolean; execution: boolean; evidence: boolean }) {
  const weights = { contracts: 20, plan: 20, execution: 25, evidence: 35 };
  const score = (Object.keys(weights) as (keyof typeof weights)[]).reduce((sum, key) => sum + (checks[key] ? weights[key] : 0), 0);
  return { score, maxScore: 100, checks, weights, interpretation: 'Deterministic verification coverage, not a calibrated success probability or semantic truth score. Quotes are checked for provenance; interpretation still needs human review.' };
}
