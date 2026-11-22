# LocalCollab — Event Creator Campaign Agent

**Describe your event. Get an evidence-backed creator shortlist and collaboration plan.**

## Who pays for this?

Account managers at small marketing and event agencies who research creators and prepare client campaign proposals. Use it for pop-ups, launches, festivals, store openings or workshops. The example is a London vintage-fashion pop-up; the product is not restricted to restaurants.

## What you receive

Up to three creator campaign cards, each with a platform-specific creator identity, supporting post links, an exact city-related caption quote, fit reasoning, a tailored concept and hook, a shot list and an outreach draft. The visual report includes a tool graph, actual run links, agent decisions, exclusions, declared checks and recorded tool costs. The dataset is ready to export into a client proposal or CRM.

This is a research and drafting agent. It sends no messages and books no creators.

## How the agent works

1. DeepSeek V4 Flash plans research from your event, city, audience and objective.
2. Google Maps supplies venue/local-business context. Instagram and TikTok Actors supply public creator posts and metadata.
3. The agent evaluates the evidence, records rejected posts, and chooses whether one targeted Instagram or TikTok follow-up is useful.
4. It proposes up to three campaign collaborations. Deterministic checks require retrieved evidence IDs, matching creator ownership, unique recommendations and an exact local caption quote.
5. Missing evidence produces fewer recommendations or an explicit insufficient-evidence result. The system does not manufacture a full shortlist.

Actors used as tools: `compass/crawler-google-places`, `apify/instagram-scraper`, `clockworks/tiktok-scraper`. No MCP server is required: the agent controller calls the Actors using the official Apify SDK/client.

## Input

Required: `eventBrief`, `city`, `audience`, `objective`.

Optional: `venue`, `lookbackDays` (1–180, default 90), `instagramHashtag` and `tiktokSearch` as initial research hints. Leave hints empty to let the agent choose. See `examples/demo.json` for the demonstration input.

## Output

- Default dataset: structured creator campaign recommendations.
- `OUTPUT`: complete brief, campaign plan, source evidence, local context, tool receipts and decisions.
- `REPORT.html`: graphical, interactive client-facing report.
- `CAMPAIGN_STATE`: execution checkpoint with tool run IDs and a fixed evidence-window timestamp.

`VERIFIED_SAMPLE` means the declared citation/identity/local-caption checks passed and both social platforms supplied usable evidence. `PARTIAL_EVIDENCE` means recommendations exist but a source was unavailable or lacked usable evidence. `INSUFFICIENT_EVIDENCE` does not mean a useful shortlist was found. Relevance and creative quality require agency review.

## Boundaries and responsible claims

A creator posting about a city does not establish where their audience lives. Creator fees, audience demographics, availability and willingness to collaborate remain unknown. The agent does not infer cross-platform identity from matching usernames, watch/transcribe videos, measure engagement growth or guarantee attendance, reach or sales. It analyzes captions and returned metadata. Search results are a small biased sample, not exhaustive creator discovery.

Use public data and comply with the target platforms' terms. Campaign drafts require human review. TikTok source availability varies by target market.

## Pricing

Launch pricing: no additional Actor fee. Platform usage, dependent Actor charges and inference still apply; the report separates recorded child costs from inference and parent charges. This is not a zero-cost run. Planned monetization is $0.50 per generated campaign pack with at least one supported recommendation, but that fee is not active: the owner must complete payout billing information before enabling paid events. The pack contains up to three recommendations.

## Costs and execution limits

At most four paid Actor starts (three initial tools and one agent-selected follow-up), four bounded model calls including one repair, and 12 requested posts per social-tool call. Each tool has a $0.50 PPE cap, 1 GB memory and 90-second timeout. Dataset reads are capped. Parent execution is bounded separately. PPE caps do not guarantee an all-in dollar limit: usage-based compute and model charges are additional. Reported tool costs exclude the agent's own compute and inference.

The Actor uses platform usage billing for this initial demo; no additional creator-agent fee is configured. A per-completed-campaign fee can be evaluated after repeated cost measurements. Child Actor charges still apply.

Checkpointed runs reuse saved successful tool outputs. Starts are never blindly retried; an unresolved STARTING state requires run inspection. Changed inputs require a fresh run.

## Development and deployment

Node.js 24:

```sh
npm ci
npm run check
npm test
apify push
```

The platform supplies `APIFY_TOKEN`. DeepSeek uses the Apify OpenRouter proxy; do not put API tokens into input fields. The runtime uses limited permissions. Parent source: https://github.com/Arin016/apify-hackathon-starter/tree/main/campaign-agent
