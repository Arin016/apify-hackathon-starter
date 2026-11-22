import 'dotenv/config';
import { Actor } from 'apify';
import { z } from 'zod';
import robotsParser from 'robots-parser';
import { extractEvidence } from './evidence.js';
import { analyze } from './llm.js';

const Input = z.object({ mode: z.enum(['fixture', 'live']).default('fixture'), aiCheck: z.boolean().default(false) });
const userAgent = 'HackathonEvidenceStarter/0.1';

async function get(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  return response;
}

await Actor.init();
try {
  const input = Input.parse(await Actor.getInput() ?? {});
  const fixture = input.mode === 'fixture';
  const url = fixture ? 'https://fixture.invalid/notice' : 'https://example.com/';
  let html = '<html><head><title>Synthetic setup notice</title></head><body><h1>Website development tender</h1><p>Applicants must have three years of experience.</p><p>Submission deadline: 30 November 2026.</p></body></html>';
  if (!fixture) {
    const robotsUrl = 'https://example.com/robots.txt';
    const robotsResponse = await get(robotsUrl);
    if (robotsResponse.status !== 404) {
      if (!robotsResponse.ok) throw new Error(`Robots unavailable: ${robotsResponse.status}`);
      const rules = robotsParser(robotsUrl, await robotsResponse.text());
      if (rules.isAllowed(url, userAgent) === false) throw new Error('Robots disallows this page');
    }
    const response = await get(url);
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Expected HTML');
    html = await response.text();
  }
  const row = extractEvidence(html, url, fixture);
  const aiCheck = input.aiCheck ? await analyze('Synthetic setup notice: applicants need three years of experience.',
    'Return exactly {"yearsRequired":3}.', z.object({ yearsRequired: z.literal(3) })) : null;
  await Actor.pushData(row);
  await Actor.setValue('OUTPUT', {
    status: 'ok', mode: input.mode, count: 1, aiCheck,
    note: 'Setup verification only. No AI analysis or commercial product implemented yet.',
    evidence: row,
  });
  console.log(`Saved ${fixture ? 'SYNTHETIC' : 'LIVE'} evidence and OUTPUT.`);
} catch (error) {
  await Actor.fail(error instanceof Error ? error.message : 'Run failed');
}
await Actor.exit();
