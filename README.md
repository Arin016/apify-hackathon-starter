# Workflow Composer

Bring your current workflow or goal. Compare complete alternatives against the same output requirements on your sample, then export a passing workflow as a reusable Actor.

## Workflow comparison — the core product

Teams often keep their first Actors because testing substitutes takes time. A Store price does not establish whether another workflow preserves required fields, input coverage and usable output. Comparison mode measures complete candidate workflows against one frozen acceptance contract and input cohort.

Use `workflowMode: "benchmark"` with `examples/benchmark-live.json`. The default research comparison tests **Search + Website Content Crawler**, **RAG Web Browser**, and **direct URL crawling**. All must return URL, title and at least 300 characters of readable text, with all supplied input URLs covered and no duplicate keys. Because the sample already supplies a URL, removing discovery is a real candidate, not a changed task. RAG uses its documented URL fast path. Candidate failure is retained with reasons; missing data is not silently dropped from the score.

Each candidate runs in its own bounded instance of the graph runner, so reported candidate cost includes its wrapper and explicitly recorded child runs. Tests use the same parameters/contract, two concurrent wrappers at most, one sample attempt by default, and $2 of total child PPE allocations in the example (not an upfront charge or guaranteed all-in limit). Model-node costs and undocumented nested/external charges are not inferred. Model-node candidates with unknown total costs block a cheapest recommendation. Coordinator overhead is separate. One successful sample is not a production reliability estimate.

`benchmarkJson` accepts other candidate graphs and a shared contract, allowing comparisons beyond the built-in proposal recipe. Candidate generation is currently curated for web-text collection; broad automatic alternative discovery is not a solved universal optimizer. Missing-field, schema, coverage and cost failures remain visible. Only a passing, cost-measurable candidate can become the lowest-observed-cost recommendation. A baseline that is already best should be kept.

The report follows the supplied product reference: light-gray canvas, white cards, navy rail, purple/blue accents, a selectable workflow graph, step inspector, actual costs, input coverage and source evidence. Download creates a real project ZIP; the deploy helper builds/tests it and attaches an Actor/run receipt back to the originating run when origin metadata is present.

## General workflow compiler

Set `workflowMode` to `graph` to compile a declarative DAG, or let goal-only auto routing choose the graph path for other public read-only data workflows. `candidateActorIds` supplies reviewed existing Actors; an empty list enables bounded Store discovery (up to three search queries and six inspected candidates). Newly discovered dependencies outside the maintained trusted catalog return `ACTOR_REVIEW_REQUIRED` before paid execution. Review them and provide their IDs as candidates to proceed. There is no promise of arbitrary-goal coverage.

The graph supports Actor nodes, registered `project`/`concat`/`dedupe` transforms, and model nodes with runtime-validated output JSON schemas. JSON-pointer bindings support take/pluck/wrap/truncate operations. No plan can execute JavaScript, shell, loops or unbounded fanout. The compiler checks references, DAG order, Actor admission, aggregate PPE allocations, cardinality and declared runtime limits; the executor validates actual downstream inputs and output schemas. Explicit gates check nonempty rows, required fields, freshness and quote provenance with whitespace normalization. Passing means the declared checks passed, not semantic truth.

Examples:

- `examples/website-graph.json`: readable workflow definition.
- `examples/graph-live.json`: execute that graph with a public URL.
- `examples/graph-plan.json`: let DeepSeek plan a graph from the goal and a reviewed Actor contract without starting dependencies.

Bounds: at most six nodes, four Actor starts, two runtime model calls, 100 read rows per Actor and 100 records at a transform, with aggregate declared execution time at most 300 seconds. Store discovery and graph planning use additional bounded model calls (one discovery call, up to two planning attempts; auto routing may add one). Parent compute, inference and usage-based charges are additional to PPE caps. Long-running or unsupported capabilities return explicit failures/clarifications; schemas are not a guarantee of undocumented Actor behavior. Unknown output mappings must be tested.

Every export includes `scripts/deploy-workflow.mjs`. After unzipping, with the official CLI already logged in:

```sh
node scripts/deploy-workflow.mjs --project-dir . --test
```

The helper pushes the complete project, waits for a successful build and starts a fresh paid smoke run. It writes a local `deployment/result.json` receipt with the Actor/build/run details. Without `--test`, it deploys only. `apify push` creates or updates the Actor named in the project; `--actor-id` explicitly targets an existing Actor. CLI authorization stays local; no account-management token is packaged in the runtime. A result JSON is data; the compiled graph plus source/template/configuration form the executable Actor.

## Specialized recipes

Supports website research (Google Search → Website Content Crawler → DeepSeek, or explicit URLs → crawler → brief) and a new creator-content recipe (Instagram + YouTube → freshness/metric checks → within-platform ranking → five sourced creative ideas). This is a bounded compiler with a small supported catalog, not arbitrary Store-wide discovery or integration code generation. Unsupported selections fail validation or ask for clarification.

## Creator-content example

In Apify Console, set **Workflow type = Choose from my goal**, **Mode = execute**, and use:

> Give me five food content ideas for an Indian audience based on engagement on recent social posts from the last 7 days.

Leave **Selected Actors**, search query and website URLs empty. The router extracts the niche, audience, window and source search terms; the deterministic controller chooses Instagram and YouTube internally. Use `examples/creator-food.json` for the same test via CLI. Each source collects at most 15 results. Creator mode needs at least $1 of child PPE allocations ($0.50 caps, not upfront charges).

The output must contain at least five dated posts with numeric likes/comments and evidence from both platforms. Otherwise it returns **INSUFFICIENT_EVIDENCE** and no fabricated five-idea brief. A platform run can succeed while yielding zero usable content. Passing samples produce five distinct ideas citing at least three posts across both platforms. A narrow editorial gate rejects observed unsupported growth, identity, nutrition and cooking-time phrases; it does not establish semantic correctness. Source relevance and remaining creative claims still require human review.

Ranking uses percentiles within each collected platform sample of `log(1 + (likes + 3 * comments) / max(6, ageHours))`. This is a heuristic. It does not measure historical growth, predict virality, establish nationwide trends, or verify creator geography. Unknown views remain unknown. No video-content analysis/transcription runs. TikTok is not part of the India-focused recipe. The current implementation does **not** compare competing workflows or claim to find the cheapest passing option.

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
- `workflowMode`: `auto` (default), `research`, or `creator`. Auto routes goal-only requests; supplied research query/URLs/Actor selections take the research path.
- `goal`: the desired research result or creator-content brief.
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

Creator runs instead save `GOAL_ROUTE`, `CREATOR_WINDOW_END`, `CREATOR_INPUT_HASH`, `CREATOR_CONTRACTS`, `CREATOR_CHILDREN` and verified `CREATOR_IDEAS` checkpoints. Creator exports contain `compiled.creator.json`; their goal and source selection are frozen. Creator reports use explicit quality checks rather than the research recipe's verification-coverage score.

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

- Specialized research/creator recipes plus bounded declarative graphs. Comparison is implemented for supplied graph candidates and a curated web-text proposal set. No arbitrary code generation, joins, conditional branches, loops or MCP discovery UI yet.
- Only public IPv4 source destinations pass the initial URL policy. Downstream redirect behavior is delegated to the selected Actors; this is not a hardened general-purpose URL proxy.
- Dependencies may be blocked, unavailable, change behavior, return no rows, or fail. Such runs fail clearly; missing data is not invented.
- Checkpointing is scoped to resurrection of the same run, not deduplication of separate user requests. A crash between accepting a remote start and saving its ID is an unresolved distributed-systems window; exactly-once execution is not guaranteed.
- Research planning has at most two attempts and the brief one call, plus one routing call for goal-only auto mode. Creator mode has one routing call, one idea-generation call and at most one editorial/schema repair call per uninterrupted execution. Process resurrection can repeat an incomplete model call. The `fixed` setting applies to research planning, not creator routing.
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
