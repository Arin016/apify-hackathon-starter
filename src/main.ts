import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Actor } from 'apify';
import { Input, compile, confidence, hash, SEARCH, CRAWLER, type Contract, type Plan } from './contracts.js';
import { inspect } from './platform.js';
import { propose } from './planner.js';
import { execute, platformServices, type Journal } from './workflow.js';
import { exportProject, reportHtml } from './artifacts.js';
import { routeGoal, runCreator, creatorReport, type CreatorSpec } from './creator.js';

await Actor.init();
let state: Journal | undefined;
let plan: Plan | undefined;
let contracts: Contract[] = [];
const checks = { contracts: false, plan: false, execution: false, evidence: false };
const save = async () => { if (state) await Actor.setValue('STATE', state); };
try {
  let frozen: { input: Record<string, any>; plan: Plan; contracts: Contract[] } | undefined;
  try { frozen = JSON.parse(await readFile(new URL('../compiled.workflow.json', import.meta.url), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const raw = await Actor.getInput<Record<string, unknown>>() ?? {};
  console.log('CONTROLLER: input received');
  let creatorFrozen: { input: Record<string, any>; spec: CreatorSpec; contracts: Contract[] } | undefined;
  try { creatorFrozen = JSON.parse(await readFile(new URL('../compiled.creator.json', import.meta.url), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (creatorFrozen && raw.goal && raw.goal !== creatorFrozen.input.goal) throw new Error('Frozen creator goal cannot be overridden; compile a new workflow.');
  if (frozen && ((raw.goal && raw.goal !== frozen.input.goal) || (raw.actorIds && hash(raw.actorIds) !== hash(frozen.input.actorIds)))) throw new Error('Frozen goal/Actor selections cannot be overridden; compile a new workflow');
  const input = Input.parse({ ...frozen?.input, ...creatorFrozen?.input, ...raw });
  if (creatorFrozen && (input.workflowMode !== 'creator' || input.actorIds.length)) throw new Error('Frozen creator source selection cannot be overridden.');
  let route = await Actor.getValue<CreatorSpec>('GOAL_ROUTE');
  console.log('CONTROLLER: routing checkpoint read');
  if (!frozen && !route && (creatorFrozen || input.workflowMode === 'creator' || (input.workflowMode === 'auto' && !input.actorIds.length && !input.startUrls.length && !input.query))) {
    route = creatorFrozen?.spec ?? await routeGoal(input.goal);
    await Actor.setValue('GOAL_ROUTE',route);
  }
  if (!frozen && (creatorFrozen || input.workflowMode === 'creator' || route?.kind === 'creator')) {
    if (!route || route.kind !== 'creator') throw new Error('Creator mode needs a recent social-content brief goal.');
    await runCreator(input,route,creatorFrozen?.contracts);
    await Actor.exit();
  }
  if (route?.kind === 'unsupported') throw new Error('Goal is outside supported research and creator-brief recipes.');
  const inputHash = hash(input);
  state = await Actor.getValue<Journal>('STATE') ?? { inputHash, planHash: '', phase: 'VALIDATING', events: [], children: {} };
  if (state.inputHash !== inputHash) throw new Error('Checkpoint input differs; use a fresh run');
  await save();
  const savedContracts = await Actor.getValue<Contract[]>('CONTRACTS');
  const ids = frozen?.plan.actorIds ?? (input.actorIds.length ? input.actorIds : input.startUrls.length ? [CRAWLER] : [SEARCH, CRAWLER]);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Actor selections');
  state.phase = 'INSPECTING'; state.events.push({ at: new Date().toISOString(), phase: 'INSPECTING', detail: 'Read live metadata and successful build input schemas; no paid child runs yet' }); await save();
  for (const id of ids) contracts.push(await inspect(id, (frozen?.contracts ?? savedContracts)?.find(c => c.actorId === id)));
  checks.contracts = true; await Actor.setValue('CONTRACTS', contracts);
  const existing = await Actor.getValue<Plan>('PLAN');
  if (existing && !frozen) plan = existing;
  else if (frozen) plan = compile(input, { status: 'ready', recipe: frozen.plan.recipe, title: frozen.plan.title, searchQuery: input.query || frozen.plan.query, questions: [] });
  else {
    state.phase = 'PLANNING'; await save();
    const draft = await propose(input, contracts);
    if (draft.status !== 'ready') {
      const output = { status: draft.status, questions: draft.questions, draft, confidence: confidence(checks), supportedRecipes: ['search_brief', 'website_brief'] };
      await Actor.setValue('OUTPUT', output); await Actor.pushData(output); await Actor.exit();
    }
    plan = compile(input, draft);
  }
  if (!plan) throw new Error('No compiled plan');
  checks.plan = true; state.planHash = hash(plan); await save(); await Actor.setValue('PLAN', plan);
  const budgetPolicy = { perChildPpeChargeCapUsd: input.testBudgetUsd / plan.actorIds.length, maxStepSeconds: input.maxStepSeconds, childMemoryMb: 1024, maxPages: input.maxPages, maxPaidChildStarts: plan.actorIds.length, maxModelCalls: (frozen || input.planner === 'fixed' ? 1 : 3) + (route ? 1 : 0), note: 'PPE caps plus page/time/memory bounds. Not a guaranteed total-dollar cap: pay-per-usage dependency costs, parent compute and model usage remain additional. No automatic child restarts or blind start retries.' };
  let result: Record<string, any>;
  if (input.mode === 'plan') result = { status: 'PLANNED_NOT_TESTED', confidence: confidence(checks) };
  else {
    const cached = await Actor.getValue<{ planHash: string; result: Record<string, any> }>('VERIFIED_RESULT');
    if (cached && cached.planHash !== hash(plan)) throw new Error('Verified checkpoint plan differs');
    result = cached?.result ?? await execute(plan, input, contracts, platformServices(input, plan, state, save));
    checks.execution = true; checks.evidence = true; result.status = 'VERIFIED';
    await Actor.setValue('VERIFIED_RESULT', { planHash: hash(plan), result });
  }
  const project = frozen ? { compiledActor: true, planningSkipped: true } : await exportProject(input, plan, contracts, input.mode === 'execute');
  const output: Record<string, any> = { ...result, plan, planHash: hash(plan), model: process.env.LLM_MODEL || 'deepseek/deepseek-v4-flash', dependencies: contracts.map(({ schema, ...rest }) => rest), project, budgetPolicy, children: state.children, events: state.events };
  await Actor.setValue('REPORT.html', reportHtml(output), { contentType: 'text/html' });
  await Actor.setValue('OUTPUT', output);
  await Actor.pushData({ status: output.status, confidence: output.confidence, planHash: output.planHash, brief: output.brief ?? null, project, children: state.children });
  state.phase = output.status; await save(); await Actor.setStatusMessage(`${output.status}: source-backed workflow and artifacts saved`);
} catch (error) {
  const token = process.env.APIFY_TOKEN ?? '';
  const message = (error instanceof Error ? error.message : 'Workflow failed').replaceAll(token || '__NO_TOKEN__', '[redacted]').slice(0, 1500);
  if (state) { state.phase = 'FAILED'; state.events.push({ at: new Date().toISOString(), phase: 'FAILED', detail: message }); await save(); }
  let output: Record<string,any> = { status: 'FAILED', error: message, confidence: confidence(checks), plan, children: state?.children, events: state?.events };
  const creatorSpec=await Actor.getValue<CreatorSpec>('GOAL_ROUTE');
  if(creatorSpec?.kind==='creator') {
    const evidence=await Actor.getValue<Record<string,any>>('CREATOR_LAST_EVIDENCE')??{spec:creatorSpec,posts:[],children:await Actor.getValue('CREATOR_CHILDREN')??{}};
    output={...evidence,status:'FAILED',error:message,message,ideas:[]};
    await Actor.setValue('REPORT.html',creatorReport(output),{contentType:'text/html'});
  }
  await Actor.setValue('OUTPUT', output); await Actor.pushData(output); await Actor.fail(message);
}
await Actor.exit();
