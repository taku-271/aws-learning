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
└── terraform/               # Terraform code, only if this topic includes a Terraform hands-on
```

- Numbering reflects study order — when adding a new topic, use the next unused number.
- `cdk/` and `terraform/` are optional and independent: a topic may have one, both, or neither,
  depending on which tool (if any) was used for that topic's hands-on.
- Each topic's `README.md` is the primary deliverable for that topic (the summary of what was
  learned); the `cdk/`/`terraform/` code exists to support and demonstrate that learning.
- When creating a new topic, follow the structure of existing topic directories rather than
  inventing a new layout.

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
