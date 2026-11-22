import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input, compile, assertPlan, confidence, verifyBrief, SEARCH, CRAWLER, type Contract } from '../src/contracts.js';
import { execute, type Services } from '../src/workflow.js';
import { publicIPv4, validateDependencyInput } from '../src/platform.js';
import { reportHtml } from '../src/artifacts.js';

const input = Input.parse({ goal: 'Research a company using public sources', actorIds: [SEARCH, CRAWLER], query: 'example company', planner: 'fixed' });
const plan = compile(input, { status: 'ready', recipe: 'search_brief', title: 'Research brief', searchQuery: input.query, questions: [] });
const contracts: Contract[] = [SEARCH, CRAWLER].map(actorId => ({ actorId, buildId: 'known-build', buildNumber: '0.1.1', schemaHash: 'test', schema: { type: 'object', required: actorId === SEARCH ? ['queries'] : ['startUrls'], properties: actorId === SEARCH ? { queries: { type: 'string' } } : { startUrls: { type: 'array' } } }, pricingModel: 'test' }));
const text = 'This company provides verified public data tools for developers.';
const brief = { claims: [{ sourceUrl: 'https://example.com/', quote: 'public data tools for developers', finding: 'The page describes developer data tools.' }], limitations: ['Only one page inspected'] };
function harness(overrides: Partial<Services> = {}) {
  const calls: string[] = [];
  const services: Services = { url: async u => u, event: async phase => { calls.push(phase); }, brief: async () => brief,
    run: async (step, _contract, value) => { calls.push(step); if (step === 'discover') return [{ organicResults: [{ url: 'https://example.com/' }] }]; assert.deepEqual(value.startUrls, [{ url: 'https://example.com/' }]); return [{ url: 'https://example.com/', text }]; }, ...overrides };
  return { services, calls };
}
test('fixed controller maps search URLs into crawl input and verifies exact evidence', async () => {
  const { services, calls } = harness(); const out = await execute(plan, input, contracts, services);
  assert.equal(out.confidence.score, 100); assert.equal(out.brief.claims.length, 1);
  assert.deepEqual(calls.filter(x => ['discover', 'extract'].includes(x)), ['discover', 'extract']);
});
test('missing search results stops before any crawling or AI call', async () => {
  let paidLater = false; const { services } = harness({ run: async step => { if (step !== 'discover') paidLater = true; return []; }, brief: async () => { paidLater = true; return brief; } });
  await assert.rejects(execute(plan, input, contracts, services), /SEARCH_OUTPUT_GATE_FAILED/); assert.equal(paidLater, false);
});
test('empty crawl content stops before AI interpretation', async () => {
  let ai = false; const { services } = harness({ run: async step => step === 'discover' ? [{ organicResults: [{ url: 'https://example.com/' }] }] : [{ url: 'https://example.com/', text: '' }], brief: async () => { ai = true; return brief; } });
  await assert.rejects(execute(plan, input, contracts, services), /CRAWL_OUTPUT_GATE_FAILED/); assert.equal(ai, false);
});
test('invented quotes and unrelated source URLs fail the evidence gate', () => {
  assert.throws(() => verifyBrief({ ...brief, claims: [{ ...brief.claims[0]!, quote: 'invented quotation' }] }, [{ url: 'https://example.com/', title: '', text }]), /EVIDENCE_GATE_FAILED/);
  assert.throws(() => verifyBrief({ ...brief, claims: [{ ...brief.claims[0]!, sourceUrl: 'https://other.example/' }] }, [{ url: 'https://example.com/', title: '', text }]), /EVIDENCE_GATE_FAILED/);
});
test('unsupported Actors, duplicate choices, and mismatched recipes are rejected', () => {
  assert.equal(Input.safeParse({ goal: input.goal, actorIds: ['malicious/unknown'] }).success, false);
  assert.throws(() => compile({ ...input, actorIds: [CRAWLER] }, { status: 'ready', recipe: 'search_brief', title: 'bad selection', searchQuery: 'q', questions: [] }), /Selected Actors/);
  assert.throws(() => compile({ ...input, actorIds: [CRAWLER, CRAWLER] }, { status: 'ready', recipe: 'website_brief', title: 'duplicate', searchQuery: null, questions: [] }), /Duplicate/);
});
test('tampered plan, unresolved questions, and invalid dependency input cannot execute', () => {
  assert.throws(() => assertPlan({ ...plan, steps: [] }, input), /deterministic compiler/);
  assert.throws(() => compile(input, { status: 'needs_clarification', recipe: null, title: 'Question', searchQuery: null, questions: ['Which source?'] }), /PLAN_NOT_READY/);
  assert.throws(() => validateDependencyInput(contracts[0]!, { queries: 42 }), /DEPENDENCY_INPUT_INVALID/);
});
test('resource limits reject oversize work and plan-only confidence does not imply testing', () => {
  assert.equal(Input.safeParse({ goal: input.goal, maxPages: 500 }).success, false);
  assert.equal(Input.safeParse({ goal: input.goal, testBudgetUsd: 100 }).success, false);
  assert.equal(confidence({ contracts: true, plan: true, execution: false, evidence: false }).score, 40);
  assert.throws(() => compile({ ...input, testBudgetUsd: 0.5 }, { status: 'ready', recipe: 'search_brief', title: 'Low cap', searchQuery: 'q', questions: [] }), /PPE allocation/);
});
test('generated report escapes untrusted source interpretation instead of running markup', () => {
  const html = reportHtml({ plan, brief: { claims: [{ ...brief.claims[0], finding: '<script>alert(1)</script>' }] }, confidence: confidence({ contracts: true, plan: true, execution: true, evidence: true }) });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
});
test('initial source address policy rejects loopback, private and non-IPv4 targets', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', '224.0.0.1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('93.184.216.34'), true);
});
