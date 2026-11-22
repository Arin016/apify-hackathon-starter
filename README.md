# Actor Fit — Workflow Optimization

**Compare complete workflows on your own inputs and output requirements. Export a tested winner as a reusable Actor.**

Teams often keep the Actors they first configured because finding and testing replacements takes time. Store listings and headline prices cannot establish whether an alternative preserves the fields, coverage and usable output a downstream process needs. Actor Fit tests complete alternatives against one shared contract before recommending a switch.

## Try the demo

Enter a public HTTPS page in **Page to test** and press **Start**. The verified demo page is `https://apify.com/actors`.

Minimal API/JSON input:

```json
{"url":"https://apify.com/actors"}
```

No workflow-type, planner or Actor-selection controls are needed. Leave **Custom workflow comparison** empty for the built-in demo. Run one comparison at a time: the coordinator, two workflow wrappers and their children can occupy all five concurrent run slots on the current account plan.

## What gets compared

1. **Current workflow:** Google Search Scraper → Website Content Crawler.
2. **Combined alternative:** RAG Web Browser using its documented direct-URL path.
3. **Direct alternative:** Website Content Crawler using the supplied URL.

All receive the same sample parameters and must return the expected URL, a title and at least 300 characters of readable text. The common contract checks required fields, expected-URL coverage, duplicates and declared blocked-page exclusions. Because the customer supplies a URL, removing discovery is a legitimate alternative for this job.

The controller validates graphs and real Actor input schemas, applies bounded execution, preserves checkpoints and run IDs, and tests the final data. Failing candidates remain visible and cannot win. If any passing candidate has incomplete measured costs, the system withholds a cheapest recommendation.

## Read the results

Open **Open graphical workflow comparison** in the run's Output menu:

- **Comparison:** candidate outcomes and observed costs.
- **Workflow graph:** select a candidate, inspect its Actor/mapping/check nodes and open recorded runs.
- **Evidence & checks:** output rows, contract checks and measurement details.
- **Create Actor:** download the complete winning project and inspect its deployment receipt.

`OUTPUT` and `BENCHMARK_RESULT` contain machine-readable comparison receipts. `REPORT.html` contains the interactive report. `ACTOR_PROJECT.zip` is produced when a passing winner has measurable costs. `DEPLOYMENT` starts as not deployed and is updated by the local publisher.

## Reuse the winner

Download and unzip the project. With the official Apify CLI logged in, run inside that folder:

```sh
node scripts/deploy-workflow.mjs --project-dir . --test
```

The helper builds the named Actor, starts a fresh bounded smoke run, validates its output status and saves `deployment/result.json`. It attaches Actor and independent-run links to the originating report when origin metadata is present. Omit `--test` to deploy only; use `--actor-id ID` to deliberately update an existing Actor.

The project contains the frozen graph, pinned dependency contracts, reusable parameters, shared acceptance contract, runtime, input schema, Dockerfile, dependency lockfile and README. A result JSON by itself is not executable. CLI owner authorization stays local; no owner token is included in the exported runtime. A cloud-hosted publishing service is not implemented.

## Compare your own workflows

The optional `benchmarkJson` string accepts a suite with `name`, `goal`, `parameters`, `contract`, `candidates` (2–3, exactly one baseline), `reviewedActorIds` and `repeats` (1–2). Each candidate supplies an admitted version-1 graph, and all goals must match the suite goal. The shared contract defines item schema, minimum usable rows, required fields, expected-key coverage, duplicate handling and optional text checks.

Graphs support Actor nodes, registered project/concat/dedupe transforms and schema-checked model nodes. The deterministic compiler checks dependencies, references, DAG order, admitted Actors, mapping shapes and resource bounds. It does not execute generated JavaScript or shell. Internal graph execution exists to run comparison candidates and frozen exported projects; it is not a separate public product mode.

Automatic built-in alternatives currently cover public-page text collection. Other jobs require explicit candidate graphs and a suitable common contract. Arbitrary-goal workflow generation and exhaustive Store-wide optimization are outside this demo's scope.

## Cost and confidence

Costs cover each dedicated workflow wrapper and its explicitly recorded children. Coordinator overhead is separate. Model-node costs and undocumented nested or external charges are not inferred. Unknown total costs block a cheapest recommendation. The built-in comparison allocates $2 across child PPE caps; this is neither an upfront charge nor a hard all-in spending cap. Actual fees follow usage, and compute is additional.

The winner is the lowest **observed cost per usable row among passing tested candidates**. It is not a global-cheapest guarantee. One successful sample does not establish production reliability. Confidence is expressed through concrete checks, coverage, provenance, sample counts and cost completeness.

## Validation

```sh
npm ci
npm run check
npm test
```

Tests cover mapping failures, schema mismatches, cycles, budget bounds, provenance, checkpoint reuse, shared acceptance contracts, cost-based exclusion and report escaping. Platform run receipts provide cloud integration evidence separately.
