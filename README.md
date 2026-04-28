# Xelera Method Final Product

**Xelera Method** is an open-source markdown-first AI product planning, gating, scoring, and handoff product by the team at **xelera.ai**.

It turns a rough product idea into a structured repo-like package before AI coding starts.

## What this product includes

- Next.js web app for guided product planning.
- Six user profiles: beginner/intermediate/advanced × business/technical.
- Markdown artifact generator.
- Ten build-control phases.
- Entry gate, work file, exit gate, review, and handoff for every phase.
- Build-readiness scorecard.
- Handoff zip export.
- CLI project generator.
- Claude/Codex-ready instructions and review checklists.

## Run locally

```bash
npm install
npm run dev
```

## CLI usage

```bash
npm run create-project -- --name="My Product" --out=./my-product-handoff
```

## Final outputs

1. `final-handoff/STEP_BY_STEP_GUIDE.md`
2. A repo-like zip containing generated artifacts, phase files, gates, reviews, scorecard, and final build handoff.

## License

MIT.
