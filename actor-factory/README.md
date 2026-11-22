# Actor Workflow Factory

Describe a public-data job. The Factory searches Apify Store, inspects candidate Actor input contracts, proposes a bounded workflow, and exports a reusable Actor project. Review discovered dependencies and execute a sample before treating a project as tested.

## Workflow

1. Enter a goal including any sample URL or search term. Select **Discover and plan**. The Console form only shows goal, mode and generated name.
2. Open the result and visual report. The plan contains the workflow graph, chosen Actors, dependencies, mappings, resource bounds and declared checks. `PLANNED_NOT_TESTED` is an untested plan; `ACTOR_REVIEW_REQUIRED` identifies dependencies to review.
3. Review each Actor's Store listing and permissions. To test the exact plan with unfamiliar Actors, use JSON/API input in a fresh run: include reviewed `candidateActorIds`, paste the prior `plan.definition` as a JSON string in `workflowJson`, and supply matching `parametersJson` if the graph needs parameters. The simplified form can test trusted Actors automatically; it will return review required for other dependencies. Paid tool calls are bounded; compute and model charges are additional.
4. After declared checks pass, download `ACTOR_PROJECT.zip`. With the official Apify CLI logged in, unzip and run:

```sh
node scripts/deploy-workflow.mjs --project-dir . --test
```

The publisher creates or updates an Actor by project name, waits for a successful build, starts an independent smoke test, and records the deployment receipt. Owner credentials remain in your local CLI. Direct creation from the cloud Factory is not implemented; it would need separate owner-authorized publishing access.

## Scope

The compiler supports accessible, limited-permission public-data Actors, declarative Actor/transform/model graphs and explicitly supported operations. It can request clarification or fail when contracts, field mappings or capabilities are missing. It cannot build every conceivable Actor from a prompt. The model proposes data; a deterministic controller validates the plan and checks execution. Passing checks means only those checks passed on the sample; it does not guarantee semantic correctness. New inputs need fresh verification.

Caps: six graph nodes, four Actor starts, two runtime model calls, bounded row counts, execution time, memory and pay-per-event allocation. Model planning, parent compute and usage-based charges are additional. No arbitrary generated code is executed. Starts are checkpointed and are not blindly retried.

## Development

Node 24: `npm ci`, `npm run check`, `npm test`, `apify push`.
