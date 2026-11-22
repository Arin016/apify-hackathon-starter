import { readFile, readdir } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { Actor } from 'apify';
import type { ComposerInput, Contract, Plan } from './contracts.js';

const root = new URL('../', import.meta.url);
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function reportHtml(result: Record<string, any>) {
  const claims = result.brief?.claims ?? [];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workflow verification report</title><style>body{font:17px/1.65 system-ui;color:#173c31;max-width:900px;margin:40px auto;padding:0 24px;background:#f6f7f1}article{background:white;padding:24px;border:1px solid #d9e3d8;border-radius:12px;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#586b61}h1{line-height:1.2}a{color:#146249}blockquote{border-left:4px solid #83b99c;margin-left:0;padding-left:20px}</style><h1>${escape(result.plan?.title ?? 'Workflow result')}</h1><p><strong>${escape(result.status)}</strong> · ${escape(result.confidence?.score ?? 0)}/100 verification coverage</p><small>${escape(result.confidence?.interpretation ?? '')}</small><article><h2>Compiled workflow</h2><pre>${escape(JSON.stringify(result.plan, null, 2))}</pre></article>${claims.map((c: any) => `<article><p>${escape(c.finding)}</p><blockquote>${escape(c.quote)}</blockquote><a href="${escape(c.sourceUrl)}" rel="noreferrer">Inspect source</a></article>`).join('')}<article><h2>Limits and costs</h2><pre>${escape(JSON.stringify({ limitations: result.brief?.limitations, budgets: result.budgetPolicy, childRuns: result.children }, null, 2))}</pre></article><article><h2>Execution trace</h2><pre>${escape(JSON.stringify(result.events, null, 2))}</pre></article></html>`;
}
export async function exportProject(input: ComposerInput, plan: Plan, contracts: Contract[], tested: boolean) {
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, text: string) => { files[name] = strToU8(text); };
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', '.dockerignore', '.gitignore', '.env.example']) add(name, await readFile(new URL(name, root), 'utf8'));
  for (const name of await readdir(new URL('src/', root))) if (name.endsWith('.ts')) add(`src/${name}`, await readFile(new URL(`src/${name}`, root), 'utf8'));
  for (const name of await readdir(new URL('tests/', root))) if (name.endsWith('.ts')) add(`tests/${name}`, await readFile(new URL(`tests/${name}`, root), 'utf8'));
  for(const name of await readdir(new URL('scripts/',root)))if(name.endsWith('.mjs'))add('scripts/'+name,await readFile(new URL('scripts/'+name,root),'utf8'));
  const manifest = JSON.parse(await readFile(new URL('.actor/actor.json', root), 'utf8'));
  manifest.name = input.generatedName; manifest.title = plan.title; manifest.description = 'Compiled, reusable sourced-brief workflow. Dependency builds and input contracts are pinned.';
  if (manifest.output?.properties) delete manifest.output.properties.project;
  add('.actor/actor.json', JSON.stringify(manifest, null, 2));
  add('.actor/Dockerfile', await readFile(new URL('.actor/Dockerfile', root), 'utf8'));
  const schema = JSON.parse(await readFile(new URL('.actor/INPUT_SCHEMA.json', root), 'utf8'));
  schema.title = plan.title; schema.properties.mode.default = 'execute'; schema.properties.goal.default = input.goal; schema.properties.actorIds.default = plan.actorIds; schema.properties.query.default = plan.query; schema.properties.startUrls.default = input.startUrls;
  add('.actor/INPUT_SCHEMA.json', JSON.stringify(schema, null, 2));
  add('compiled.workflow.json', JSON.stringify({ version: 1, input: { ...input, mode: 'execute', actorIds: plan.actorIds, query: plan.query }, plan, contracts, verification: { tested, explanation: tested ? 'The composer tested this recipe and these dependency contracts. Other source inputs require fresh verification.' : 'Compiled only; no live test has run.' } }, null, 2));
  add('README.md', `# ${plan.title}\n\nGenerated workflow Actor. ${tested ? 'The source recipe passed a live test in the composer.' : 'This export has not been live-tested.'}\n\n## Deploy\n\nWith Apify CLI installed and logged in, unzip this project and run just:\n\n\`\`\`sh\napify push\napify call --input '{}' --memory 256 --timeout 360\n\`\`\`\n\nApify builds and installs dependencies in the cloud; no local npm install or Docker is required for deployment. For local development use Node 24 LTS, npm ci, npm test, and npm run build.\n\nThe goal, Actor selections, dependency builds and mappings are frozen in compiled.workflow.json. You may change query/startUrls and bounded resource options. Changing the goal or Actor selections requires recompilation. Generated runs skip AI planning; DeepSeek produces the evidence brief. Outputs include OUTPUT, REPORT.html, trace and evidence. Confidence is verification coverage, not probability. Budget uses PPE caps and page/memory/time limits, not a guaranteed total-dollar ceiling. LLM and parent compute are additional. No user tokens are included.\n`);
  await Actor.setValue('ACTOR_PROJECT.zip', Buffer.from(zipSync(files, { level: 6 })), { contentType: 'application/zip' });
  return { key: 'ACTOR_PROJECT.zip', files: Object.keys(files), tested, deployment: 'Unzip, then apify push (with Apify CLI already logged in). Cloud builds dependencies automatically.', generatedName: input.generatedName };
}
