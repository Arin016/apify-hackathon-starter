# Workflow Composer

Bring the Actors you use—or describe your goal—and turn them into one tested, reusable workflow Actor.

## Current MVP

Supports two recipes: Google Search Results Scraper → Website Content Crawler → DeepSeek source-backed brief, and Website Content Crawler → DeepSeek brief for explicit URLs. This is a bounded compiler with a small supported catalog, not arbitrary integration code generation. Unsupported selections fail validation or ask for clarification.

## Run

Install Node 24 LTS and the official Apify CLI, then:

```sh
git clone https://github.com/Arin016/apify-hackathon-starter.git
cd apify-hackathon-starter
npm ci
npm test
npm run build
apify login
apify push
apify call --input-file examples/live.json --memory 256 --timeout 360
```

Local cloud-token inference can fail with OAuth authentication; the verified path uses the runtime token supplied to cloud Actors. No separate OpenRouter account is needed. Model: `deepseek/deepseek-v4-flash`, via `https://openrouter.apify.actor/api/v1`. Apify Free-plan token pricing may have a multiplier.

## Inputs

- `mode`: `plan` (default) or `execute`. Plan mode produces an untested export. Execute runs a small test and verifies evidence before exporting.
- `goal`: the desired research result.
- `actorIds`: supported Actor IDs. Empty selects a supported recipe from the goal and supplied sources.
- `query`: optional explicit search query; otherwise DeepSeek proposes one.
- `startUrls`: explicit public website URLs for the website-only recipe.
- `maxPages`: 1–3 (default 1).
- `maxStepSeconds`: 30–120 per dependency.
- `testBudgetUsd`: 0.1–2 (default 1), divided into child PPE charge caps. Pay-per-usage dependency costs, parent compute and model usage are additional; this is not a guaranteed total-dollar ceiling.
- `planner`: `deepseek` or `fixed`. The fixed recipe path requires explicit query/URLs.
- `generatedName`: lowercase name for the exported Actor.

## Outputs and deployment

The run's key-value store contains:

- `OUTPUT`: result, plan, source evidence, confidence checks, child runs and trace.
- `REPORT.html`: readable verification report.
- `PLAN` and `CONTRACTS`: compiler output and public dependency schemas/build references.
- `STATE` and `STEP_*`: checkpoints for resurrection of this same run.
- `ACTOR_PROJECT.zip`: generated project with frozen workflow, source, Dockerfile, schema, lockfile, tests and README. No account tokens are packaged.

Download and unzip the project, then run `apify push` with the CLI already logged in. Dependencies build in the cloud. The CLI creates the new private Actor using the exported name. Automatic creation from inside a limited-permission Actor is not implemented: it needs a separate deployment authorization path. The generated Actor runs without another planning call. Its goal, Actors, builds and mappings are fixed; users can change query/URLs and bounded execution limits. Reusing with other inputs requires fresh verification.

## Deterministic spine and bounded AI

1. Validate input and allowlisted Actor choices before paid execution.
2. Read live Actor metadata and successful build input schemas; pin exact build versions and schema hashes.
3. DeepSeek proposes a small typed recipe, never executable code or arbitrary tool arguments. One schema-repair attempt is allowed. Unsupported/ambiguous goals return explicit states.
4. Code compiles the plan and validates downstream input against the dependency's real JSON schema.
5. A serial controller executes only the compiled steps, with page/memory/time limits, PPE caps and no child auto-restarts.
6. Mutating starts use an API client with automatic retries disabled. Child IDs and completed outputs are checkpointed so resurrection can reuse them.
7. One model call interprets bounded, labelled source evidence. Every returned URL and quote is checked against retrieved text.
8. Code generates the reusable Actor project and verification report.

Confidence is a deterministic verification-coverage score: contracts 20, plan 20, successful execution 25, exact source evidence 35. Plan-only is 40/100. It is not a calibrated probability, and quote presence does not prove interpretation correctness. Human review remains necessary.

## Limits

- Two supported research recipes; no arbitrary DAGs, joins, branches, or MCP discovery UI yet.
- Only public IPv4 source destinations pass the initial URL policy. Downstream redirect behavior is delegated to the selected Actors; this is not a hardened general-purpose URL proxy.
- Dependencies may be blocked, unavailable, change behavior, return no rows, or fail. Such runs fail clearly; missing data is not invented.
- Checkpointing is scoped to resurrection of the same run, not deduplication of separate user requests. A crash between accepting a remote start and saving its ID is an unresolved distributed-systems window; exactly-once execution is not guaranteed.
- Planner has at most two attempts and the brief one call per uninterrupted execution. Process resurrection can repeat an incomplete model call.
- The search recipe requires a maximum-cost allocation of at least $1 ($0.50 per child) because of the search dependency’s minimum cap setting; this is not an upfront charge.

- No automatic model-provider fallback, hidden credential sharing, Store publication or billing configuration.

## Validation

`npm test` exercises successful field mapping, missing search/crawl data, forged quotes/URLs, unsupported/duplicate selections, tampered plans, schema mismatch, resource bounds and initial address checks. Cloud integration checks are recorded separately after deployment.

## References

- https://docs.apify.com/sdk/js/reference/class/Actor
- https://docs.apify.com/actors/development/permissions
- https://apify.com/apify/openrouter
- https://apify.com/apify/google-search-scraper
- https://apify.com/apify/website-content-crawler
