# Apify hackathon starter

This is a verified development scaffold for the AI Tools that Earn hackathon on 22 November 2026. Choose the commercial idea before expanding it. The starter collects evidence; it does not yet make buyer recommendations.

## Quick start

Install Node.js 24 LTS and the official Apify CLI (`npm install -g apify-cli`). Then:

```sh
git clone https://github.com/Arin016/apify-hackathon-starter.git
cd apify-hackathon-starter
npm ci
npm run check
npm run build
npm run smoke
apify login
apify run --input '{"mode":"live"}'
```

The smoke test uses clearly labelled synthetic content and temporary storage. The live mode fetches example.com and checks robots.txt. Run output is saved under `storage/datasets/default/` and `storage/key_value_stores/default/OUTPUT.json`. The original preparation workspace also includes an activation script for its local tools; cloned copies use the normal Node and CLI installation above.

## Start on your friend's laptop

Install Node.js 24 LTS from nodejs.org, then extract the starter archive and run `npm ci`, `npm run build`, and `npm run smoke`. For deployment, install the official CLI with `npm install -g apify-cli`, then run `apify login`. Each person should use their own credentials. Do not copy `.env`, auth files, or tokens to the repository or archive.

## Build the chosen idea

Our intended pipeline is:

```text
Buyer input
  -> Our orchestrator Actor
  -> Existing Apify Actors for data extraction
  -> Normalize results and preserve evidence
  -> Apify OpenRouter proxy for interpretation
  -> Deterministic checks and validated buyer output
  -> Dataset plus report in key-value storage
```

The existing code verifies runtime, storage, live HTTP fetching, and optional AI connectivity. Product-specific downstream Actor calls and agent orchestration are not implemented yet. Use `Actor.call()` or the Apify API client to run selected Actors, check their status, and read their default datasets. An agent framework is optional; Apify's templates cover several frameworks rather than defining a framework allowlist. Any chosen SDK still needs to run in the container and support the proxy endpoints and model features we use.

The official model proxy is [`apify/openrouter`](https://apify.com/apify/openrouter), with API base URL `https://openrouter.apify.actor/api/v1`. The starter uses its chat-completions endpoint with the cloud runtime's `APIFY_TOKEN`, not a separate OpenRouter account. Cloud JSON inference was verified with `openai/gpt-4.1-mini`. A text-generation smoke test does not verify tool-calling or streaming support for every SDK/model combination; test those after selecting the pipeline.

1. Give `.actor/actor.json` the final Actor name, matching the team name. Update title and description.
2. Replace `.actor/INPUT_SCHEMA.json` with the buyer's inputs and validate with `apify validate-schema`.
3. Extend `src/main.ts`: fetch bounded public sources, extract evidence, apply deterministic checks, then use AI only for interpretation.
4. `src/llm.ts` provides an optional JSON-validated AI call through Apify's OpenRouter proxy. It is off by default; set `aiCheck: true` to request a tiny paid synthetic check. In cloud runs Apify supplies the runtime token. Local OAuth-injected proxy access returned 403 during setup, so use the cloud path for AI verification. No extra AI account is needed. The default is `openai/gpt-4.1-mini`; a Google model was unavailable under the proxy's data policy. Check availability and prices before scaling; Free accounts have a pricing multiplier.
5. Validate exact source quotes with `quoteExists` from `src/evidence.ts`. Keep unknown values explicit. Exact quote matching proves provenance, not correctness of interpretation.
6. Save one useful buyer output per dataset row and a concise summary in the key-value store. Add input/output examples and limitations here before public release.

The live fetcher is intentionally limited to example.com for setup verification. For the product, implement source allowlists or public-address validation, redirects, bounded page sizes, request limits, retries, robots checks, and per-source error rows appropriate to the chosen source. It does not render JavaScript or parse PDFs.

## Deploy and check

```sh
apify validate-schema
apify push
apify call --input '{"mode":"live"}' --memory 256 --timeout 60 --output-dataset
```

`apify push` creates/updates the Actor and builds it. Publishing to Apify Store is a separate Console step after the chosen product is ready. Docker is used by Apify's cloud builder; no local Docker installation is required for this scaffold.

## Submission readiness

The guide requires an Actor published to Apify Store, a public source repository with run instructions, and matching team/Actor names. Highlight Apify in the live two-minute demo. The submission form was not yet linked in the guide when checked; recheck it at the venue. Ask organizers whether pre-event scaffold work is permitted before reusing it in the entry.

## Dependencies

Commit `package-lock.json`. Narrow transitive overrides pin `basic-ftp` 6.2.6 and `minimatch` 11.0.9 to fix advisories reported by npm at setup time. Recheck these when updating the SDK. Never run `npm audit fix --force` blindly; it proposed downgrading the SDK during setup.

## Sources

- [Hacker guide](https://app.notion.com/p/apify/Hacker-s-Guide-AI-Tools-that-Earn-Hackathon-27df39950a228308ae89014a1d8034b2)
- [Event and judging](https://luma.com/apify-yc12)
- [Apify CLI](https://docs.apify.com/cli/docs/reference)
- [JavaScript SDK](https://docs.apify.com/sdk/js/docs/overview)
- [AI proxy](https://apify.com/apify/openrouter)
