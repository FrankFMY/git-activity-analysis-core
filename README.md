# Git Activity Analysis Core

A privacy-aware, deterministic TypeScript library for scanning local Git history, producing activity aggregates, parsing Conventional Commits, and clustering related work without an LLM or a hosted API.

## Why

Git history is useful input for engineering reports, portfolio tooling, changelogs, repository dashboards, and local developer analytics. Existing implementations often mix the reusable mechanics with a database, social-media product, GitHub token, or model prompt. This package keeps the boundary small:

- local Git subprocesses only;
- no network calls;
- no runtime dependencies;
- deterministic output;
- author email and commit body are excluded by default;
- bounded commit count and subprocess buffers;
- sanitized public errors that do not copy Git stderr or repository paths;
- lazy object fetching disabled; partial repositories with missing reachable objects fail closed instead of contacting a promisor remote;

## Features

- scan normal repositories, bare repositories, linked worktrees, detached HEADs, and empty repositories;
- robust NUL-delimited commit metadata, including multiline bodies and unusual file paths;
- per-file insertion/deletion and binary-change accounting;
- branch and annotated/lightweight tag inventory;
- UTC daily totals, category counts, author aggregation, and top-file activity;
- Conventional Commits parsing with `!`, scope, and `BREAKING CHANGE` footers;
- deterministic clustering by non-hub file overlap and bounded temporal/topic similarity;
- opt-in raw author email and commit body fields.

## Installation

Registry publication is not required to use the package. The GitHub release asset contains the built package and does not execute a Git prepare lifecycle:

```bash
npm install https://github.com/FrankFMY/git-activity-analysis-core/releases/download/v0.1.0/git-activity-analysis-core-0.1.0.tgz
```

Registry installation (when the version is available):

```bash
npm install git-activity-analysis-core
```

Direct Git dependencies require an explicit opt-in starting with npm 12. The package supports that path through its `prepare` build, but enabling Git dependencies executes source lifecycle scripts and should be reserved for a pinned, reviewed commit:

```bash
NPM_CONFIG_ALLOW_GIT=all npm install github:FrankFMY/git-activity-analysis-core#v0.1.0
```

[npm package](https://www.npmjs.com/package/git-activity-analysis-core) · [source](https://github.com/FrankFMY/git-activity-analysis-core). If this candidate is not yet in the registry, run `npm ci && npm run build && npm pack` in a source checkout and install that tarball, or use the existing release asset above. The root module uses Node subprocess APIs and is not a browser entry point.

## Scan a repository

```ts
import {
  analyzeActivity,
  clusterCommits,
  scanGitRepository,
} from "git-activity-analysis-core";

const scan = await scanGitRepository({
  repoPath: "/path/to/repository",
  ref: "main",
  since: new Date("2026-01-01T00:00:00.000Z"),
  maxCommits: 1_000,
});

const summary = analyzeActivity(scan.commits);
const clusters = clusterCommits(scan.commits);

console.log(summary.totals);
console.log(clusters.map((cluster) => cluster.commitShas));
```

`scanGitRepository` invokes the local `git` executable through `execFile`; it never uses a shell and never performs a fetch, clone, pull, or API request.

## Privacy defaults

The default result includes commit subjects and changed paths because they are necessary for useful analysis. It excludes commit bodies and author emails:

```ts
const safeByDefault = await scanGitRepository({ repoPath: "." });

const explicitSensitiveFields = await scanGitRepository({
  repoPath: ".",
  includeBody: true,
  includeAuthorEmail: true,
});
```

Commit subjects and filenames can still contain confidential information. Treat the returned data according to the source repository's sensitivity; the package never transmits it.

`analyzeActivity` uses normalized email internally to merge identities when available, but omits it from summaries unless `includeAuthorEmails: true` is explicitly supplied.

## Conventional Commits

```ts
import {
  categorizeCommit,
  parseConventionalCommit,
} from "git-activity-analysis-core";

const parsed = parseConventionalCommit(
  "feat(scanner)!: make raw identities opt-in\n\nBREAKING CHANGE: email output is disabled by default",
);

console.log(parsed.isBreaking); // true
console.log(categorizeCommit(parsed)); // "feature"
```

## Clustering model

`clusterCommits` connects commits when either:

1. they touch the same non-hub file; or
2. they occur within a bounded time window and share enough meaningful subject keywords.

Files touched by a configurable share of the history—lockfiles and other repository-wide hubs—are excluded from file edges. Components are maintained with union-find; temporal candidates use bounded sliding keyword windows instead of a dense adjacency graph. The result is deterministic and does not call an LLM.

## Boundaries

- Rename detection is disabled deliberately: a rename is represented as one deleted and one added path, which keeps `--numstat -z` parsing unambiguous for arbitrary Git filenames.
- Scanner and clustering inputs are bounded to 2,000 commits per call.
- The scanner analyzes reachable local history only. `GIT_NO_LAZY_FETCH=1` is enforced for every Git child, and missing reachable objects fail closed instead of contacting a promisor remote.
- Public result ties use locale-independent Unicode code-point order so serialized output does not change with the host locale.
- `since` and `until` use Git's commit traversal date filter; returned `authoredAt` remains the commit author timestamp.
- It is not a contribution-quality score, employee-monitoring system, authorship proof, or substitute for repository provenance review.
- Author matching by email is a grouping hint, not a legal identity claim.
- `git` must be installed and available on `PATH`.
- Node.js 20 or newer is required.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm run check
npm test
npm run build
npm run pack:check
npm run package:check
```

## Author

**Artem Prianishnikov** — [FrankFMY](https://github.com/FrankFMY)

- Website: https://frankfmy.com
- Email: Pryanishnikovartem@gmail.com · frankfmy@proton.me
- Telegram: https://t.me/FrankFMY
- LinkedIn: https://www.linkedin.com/in/frankfmy/
- X: https://x.com/FrankFMY
- npm: https://www.npmjs.com/~frankfmy

## License

Apache-2.0 © 2026 Artem Prianishnikov. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
