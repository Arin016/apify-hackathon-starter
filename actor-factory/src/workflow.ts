import { Actor } from 'apify';
import { assertPlan, Brief, confidence, crawlInput, hash, searchInput, searchUrls, sourcesFrom, verifyBrief, type BriefResult, type ComposerInput, type Contract, type Plan, type Source } from './contracts.js';
import { publicUrl, validateDependencyInput } from './platform.js';
import { summarize } from './planner.js';

export type Journal = { inputHash: string; planHash: string; phase: string; events: { at: string; phase: string; detail: string }[]; children: Record<string, { runId: string; status: string; usageUsd?: number }>; };
export type Services = {
  run: (step: string, contract: Contract, input: Record<string, unknown>) => Promise<Record<string, any>[]>;
  url: (url: string) => Promise<string>;
  brief: (goal: string, sources: Source[]) => Promise<BriefResult>;
  event: (phase: string, detail: string) => Promise<void>;
};
export async function execute(plan: Plan, input: ComposerInput, contracts: Contract[], services: Services) {
  assertPlan(plan, input);
  let urls = input.startUrls;
  if (plan.recipe === 'search_brief') {
    await services.event('DISCOVERING', 'Reading search results with a pinned Actor build');
    const contract = contracts.find(c => c.actorId === plan.actorIds[0])!;
    const value = searchInput(plan); validateDependencyInput(contract, value);
    const rows = await services.run('discover', contract, value);
    urls = searchUrls(rows, input.maxPages);
    if (!urls.length) throw new Error('SEARCH_OUTPUT_GATE_FAILED: no organicResults[].url');
  }
  const accepted: string[] = [];
  for (const value of urls.slice(0, input.maxPages)) accepted.push(await services.url(value));
  urls = [...new Set(accepted)];
  if (!urls.length) throw new Error('No valid source URLs');
  await services.event('EXTRACTING', 'Mapped validated URLs into startUrls[].url');
  const contract = contracts.find(c => c.actorId === 'apify/website-content-crawler')!;
  const value = crawlInput(urls, input); validateDependencyInput(contract, value);
  const rows = await services.run('extract', contract, value);
  const sources = sourcesFrom(rows, input.maxPages);
  if (!sources.length) throw new Error('CRAWL_OUTPUT_GATE_FAILED: no source with URL and readable text');
  for (const source of sources) await services.url(source.url);
  await services.event('SUMMARIZING', 'One bounded DeepSeek call over labelled source evidence');
  const brief = Brief.parse(await services.brief(input.goal, sources));
  verifyBrief(brief, sources);
  await services.event('VERIFIED', 'All claim URLs and exact source quotes verified');
  return { brief, sources, confidence: confidence({ contracts: true, plan: true, execution: true, evidence: true }) };
}
export function platformServices(input: ComposerInput, plan: Plan, state: Journal, save: () => Promise<void>): Services {
  const mutationClient = Actor.newClient({ maxRetries: 0, timeoutSecs: 30 });
  return {
    url: publicUrl,
    brief: summarize,
    event: async (phase, detail) => { state.phase = phase; state.events.push({ at: new Date().toISOString(), phase, detail }); await save(); await Actor.setStatusMessage(`${phase}: ${detail}`); },
    run: async (step, contract, value) => {
      // Saved output avoids re-running a completed child on resurrection of this run.
      const cache = await Actor.getValue<{ inputHash: string; rows: Record<string, any>[] }>(`STEP_${step}`);
      if (cache) { if (cache.inputHash !== hash(value)) throw new Error('Checkpoint input mismatch'); return cache.rows; }
      let child = state.children[step];
      if (!child) {
        const run = await mutationClient.actor(contract.actorId).start(value, { build: contract.buildNumber, memory: 1024, timeout: input.maxStepSeconds, maxTotalChargeUsd: input.testBudgetUsd / plan.actorIds.length, restartOnError: false });
        child = state.children[step] = { runId: run.id, status: run.status }; await save();
      }
      const result = await Actor.apifyClient.run(child.runId).waitForFinish({ waitSecs: input.maxStepSeconds + 10 });
      child.status = result.status; child.usageUsd = result.usageTotalUsd; await save();
      if (result.status !== 'SUCCEEDED') {
        if (['RUNNING', 'READY', 'TIMING-OUT'].includes(result.status)) await Actor.apifyClient.run(result.id).abort();
        throw new Error(`Child ${step} did not succeed: ${result.status} (${result.id})`);
      }
      const { items } = await Actor.apifyClient.dataset(result.defaultDatasetId).listItems({ limit: step === 'discover' ? 2 : input.maxPages, clean: true });
      const rows = items as Record<string, any>[];
      await Actor.setValue(`STEP_${step}`, { inputHash: hash(value), rows }); return rows;
    },
  };
}
