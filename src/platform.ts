import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Actor } from 'apify';
import { Ajv } from 'ajv';
import { hash, type Contract } from './contracts.js';

// Pure/idempotent reads may retry once. Mutating child-run starts are never blindly retried.
export async function readWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch { return operation(); }
}
export async function inspect(actorId: string, pinned?: Contract): Promise<Contract> {
  const reader = Actor.newClient({ maxRetries: 0, timeoutSecs: 15 });
  const actor = reader.actor(actorId);
  const details = await readWithRetry(() => actor.get());
  if (!details || details.actorPermissionLevel === 'FULL_PERMISSIONS') throw new Error(`Unsupported or full-permission dependency: ${actorId}`);
  const buildClient = pinned ? reader.build(pinned.buildId) : await readWithRetry(() => actor.defaultBuild());
  const build = await readWithRetry(() => buildClient.get());
  if (!build || build.status !== 'SUCCEEDED' || !build.inputSchema) throw new Error(`No successful build/input contract: ${actorId}`);
  const schema = typeof build.inputSchema === 'string' ? JSON.parse(build.inputSchema) : build.inputSchema;
  const contract: Contract = { actorId, buildId: build.id, buildNumber: build.buildNumber, schemaHash: hash(schema), schema, pricingModel: String((details as any).currentPricingInfo?.pricingModel ?? 'unknown') };
  if (pinned && (contract.schemaHash !== pinned.schemaHash || contract.buildId !== pinned.buildId)) throw new Error('Pinned dependency contract changed');
  return contract;
}
export function validateDependencyInput(contract: Contract, value: Record<string, unknown>) {
  const ajv = new Ajv({ strict: false, validateSchema: false, allErrors: true, formats: { uri: true, url: true, regex: true } });
  const schema = { ...contract.schema }; delete schema.$schema;
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(`DEPENDENCY_INPUT_INVALID ${contract.actorId}: ${ajv.errorsText(validate.errors)}`);
}
export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b!)) || (a === 100 && b! >= 64 && b! <= 127) || (a === 198 && [18, 19, 51].includes(b!)) || (a === 203 && b === 0));
}
export async function publicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Unsupported public URL');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !publicIPv4(a.address))) throw new Error('Source must resolve to public IPv4 addresses');
  url.hash = ''; return url.href;
}
