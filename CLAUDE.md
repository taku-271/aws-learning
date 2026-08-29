# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This is a personal AWS study repository (not a production codebase). It holds notes on AWS
services/concepts plus hands-on infrastructure-as-code written while learning each topic. There is
no shared application, package, or build pipeline tying topics together — each topic directory is
self-contained.

## Structure and conventions

Each study topic gets its own top-level directory, numbered in the order it was studied:

```
<番号>-<トピック名>/        e.g. 01-vpc/, 02-iam/, 03-lambda/
├── README.md               # 学習内容のまとめ(概要、ハンズオン手順、参考リンクなど)
├── cdk/                     # AWS CDK code, only if this topic includes a CDK hands-on
├── terraform/               # Terraform code, only if this topic includes a Terraform hands-on
└── site/                    # Hand-authored public page for this topic, only if publishing it
```

- Numbering reflects study order — when adding a new topic, use the next unused number.
- `cdk/` and `terraform/` are optional and independent: a topic may have one, both, or neither,
  depending on which tool (if any) was used for that topic's hands-on.
- Each topic's `README.md` is the primary deliverable for that topic (the summary of what was
  learned); the `cdk/`/`terraform/` code exists to support and demonstrate that learning.
- When creating a new topic, follow the structure of existing topic directories rather than
  inventing a new layout.

`<topic>/site/`, when present, is a hand-authored `index.html` plus `style.css` that is that topic's
public page — a separate artifact, not a rendering of the README. It's optional and separate from
README.md: write it only when the user wants that topic published. It does not need to mirror the
README's content.

All topics' `site/` pages share one common design system, so the published site feels consistent
when browsing between topics. Reuse the same CSS custom properties (`--bg`, `--fg`, `--muted`,
`--border`, `--link`, `--accent`, `--panel`, `--code-bg`, `--pill-bg`/`--pill-fg`, light/dark via
`prefers-color-scheme`) and the same structural classes (`.page`, `.back-link`, `header.hero` with
`.topic-number`/`.pill-row`/`.pill`, `<section>` blocks under `h2`, `.card-grid`, `.flow`, `table`,
`.refs`, `footer`, `.quiz-item`/`.quiz-choices`/`.quiz-choice`/`.quiz-feedback`/`.quiz-result`/
`.quiz-explanation`) established in `02-bedrock-agentcore-gateway/site/`. When writing a new topic's
`site/`, copy that topic's `style.css` as the starting point rather than inventing a new one, and
only add topic-specific classes (like `02`'s `.diagram`/`.auth-columns`) for content that doesn't
fit the shared components. Link back to the site's top page with `../../index.html` if you want a
"back to list" link.

A `site/` page should communicate visually, not just in prose — text-and-tables-only pages (like
`01-bedrock-managed-knowledge-base/site/` before this convention existed) are the pattern to avoid,
not the model to copy. For every topic `site/` page:

- Include at least one architecture/flow diagram near the top (after the intro, before the detail
  sections) showing how the service's main pieces connect — the components involved, the direction
  of calls/data, and where the topic's key concept sits in that picture. Follow the inline-SVG
  pattern in `02-bedrock-agentcore-gateway/site/index.html`'s `.diagram` block (nodes as
  `rect`/`text`, edges as `line` + arrow `marker`, colors from the shared CSS variables so it
  adapts to light/dark) rather than linking to an external image file — it stays self-contained,
  themeable, and consistent with the existing page.
- Prefer a second, purpose-built diagram over a wall of prose wherever the content is inherently
  comparative or sequential: a step-by-step process reads better as a `.flow` list or a simple SVG
  sequence than a paragraph of steps; a two-option comparison (like `02`'s inbound/outbound auth)
  reads better as an `.auth-columns`-style side-by-side than as running text.
  A `table` is fine for dense reference data (pricing line items, feature matrices, region lists)
  but shouldn't be the page's only visual device — pair it with a diagram or card layout elsewhere
  on the page.
  Add new topic-specific visual classes (in the topic's own `style.css`, following the shared
  design tokens) when the shared `.diagram`/`.card-grid`/`.auth-columns`/`.flow` set doesn't fit the
  content — don't force unrelated content into an existing diagram just to avoid adding a class.
- Include a 4-choice comprehension quiz near the end of the page, right before the 参考リンク
  section — questions built from that topic's own content (the same facts covered in the
  diagrams/tables/cards above), not generic AWS trivia. Use at least 3 questions, but scale the
  count to how much the page covers: skim the page's own section list first, and if 3 questions
  would leave whole sections (a features table, pricing, hands-on steps, a comparison) completely
  untouched, add more (`01`/`02`/`03` each ended up at 5) so the quiz samples across most of the
  page rather than only its first couple of sections. Follow the `.quiz-item` pattern in
  `03-sqs/site/index.html`: each question is a `<div class="quiz-item">` containing one
  `<p class="quiz-question">`, a `.quiz-choices` block of four `<button class="quiz-choice"
  data-correct="true">`/`data-correct="false">` buttons, and a `<div class="quiz-feedback" hidden>`
  holding `<p class="quiz-result">` (left empty — the script fills in 正解!/不正解) and
  `<p class="quiz-explanation">` (write the explanation text here). Copy the same inline
  `<script>` block (right before `</body>`) that wires up click-to-reveal behavior — it is generic
  over every `.quiz-item` on the page, so it works unchanged in a new topic's page. Keep the script
  inline in each page rather than factoring it into a shared `.js` file, consistent with each
  `site/` page staying a self-contained artifact.
- When revisiting an existing topic's `site/` page for unrelated work, take the opportunity to add
  a missing diagram or quiz if the page doesn't have one — don't leave older pages as outliers as
  the design system matures.

One exception to the numbered-topic layout: `site/` at the repo root. It is not a study topic — it's
an AWS Blocks app that collects every topic's `<topic>/site/` directory into a single static HTML
site and hosts it on CloudFront + S3. It does no templating or conversion of its own beyond building
the top-level topic-list page; see `site/README.md` for details. Regenerate it (`npm run build` /
`npm run deploy` inside `site/`) whenever a topic's `site/` page changes if you want the published
site to stay current — it is not run automatically.

## Study workflow

When the user says they want to study a topic (e.g. "〜を勉強したい"), always research it using
the AWS MCP server(s) available in the session (e.g. AWS documentation/knowledge MCP tools) before
writing anything. Do this in order:

1. Use the AWS MCP tools to look up official documentation/best practices for the topic (search
   docs, read relevant pages) rather than relying on general knowledge alone.
2. Create the next numbered topic directory (see Structure and conventions above) and write the
   findings into its `README.md` as the study summary.
3. Only after the summary is written, add hands-on `cdk/` and/or `terraform/` code for the topic if
   requested or appropriate.
4. If the user wants this topic published to the site, write `<topic>/site/index.html` (see
   Structure and conventions above) using the shared design system — a hand-authored page, not an
   auto-generated one, but consistent in look with the other topics' `site/` pages.
5. This isn't limited to the initial study session: whenever later work in the same conversation
   produces a study-relevant result for an existing topic (e.g. answering a follow-up question with
   fresh AWS-doc research, a cost/performance comparison, a deeper dive into one part of the topic),
   append it to that topic's `README.md` too — don't leave it only in the chat response. If that
   topic already has a `<topic>/site/index.html`, add the same content there as well (matching that
   page's existing style), so the README and the published site stay in sync. If the topic has no
   `site/` page yet, updating the README alone is enough — don't create a `site/` page just for this
   (see Study workflow step 4 for when to add one).

If no AWS MCP server is available in the session, tell the user before falling back to general
knowledge, since the point of this workflow is to ground the notes in current AWS documentation.

## Working with CDK code

CDK apps live per-topic under `<topic>/cdk/`. Each is an independent CDK app (own
`package.json`/`cdk.json`), not part of a shared workspace. `cd` into the specific topic's `cdk/`
directory before running commands:

```bash
npm install
npx cdk synth       # synthesize CloudFormation template
npx cdk diff         # compare against deployed stack
npx cdk deploy       # deploy to AWS
npx cdk destroy      # tear down — always destroy hands-on stacks after study to avoid AWS charges
```

## Working with Terraform code

Terraform code lives per-topic under `<topic>/terraform/`, each an independent root module. `cd`
into the specific topic's `terraform/` directory before running commands:

```bash
terraform init
terraform plan
terraform apply
terraform destroy   # always destroy hands-on resources after study to avoid AWS charges
```

## Notes for future work in this repo

- Do not assume any two topic directories share dependencies, versions, or state — treat each as
  isolated.
- Since this repo deploys real AWS resources for learning purposes, prefer destroying stacks
  (`cdk destroy` / `terraform destroy`) after verifying a hands-on works, rather than leaving them
  running.
