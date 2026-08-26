# Contributing

Contributions should preserve deterministic output, local-only execution, privacy-safe defaults, and compatibility with unusual valid Git metadata.

1. Open an issue describing the behavior and trust boundary.
2. Add a failing regression test first.
3. Implement the smallest complete fix.
4. Run the full gate:

```bash
npm ci
npm run format:check
npm run lint
npm run check
npm test
npm run build
npm run pack:check
```

Do not add hosted telemetry, network enrichment, shell execution, repository-specific defaults, real private identities, or LLM coupling to the core package.
