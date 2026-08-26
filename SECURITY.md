# Security Policy

## Supported versions

Security fixes target the latest `0.1.x` release until a stable policy is established.

## Trust boundary

- The scanner runs local read-only Git commands and never performs network operations.
- Every Git child receives `GIT_NO_LAZY_FETCH=1`; a preflight reachable-object inventory rejects partial repositories with missing objects before analysis.
- `repoPath` and Git stderr are not copied into public `GitAnalysisError` messages.
- Option-like or ambiguous refs are rejected and resolved to a commit before history traversal.
- Commit count, subprocess timeout, and output buffers are bounded.
- Clustering is capped at 2,000 commits and uses union-find plus sliding keyword windows rather than retaining a dense edge graph.
- Commit bodies and author emails are opt-in. Subjects and filenames remain part of the useful analysis surface and may themselves be sensitive.
- Consumers are responsible for where they persist or transmit returned Git data.
- The package does not execute hooks, shell commands, commit content, repository files, or generated code.

## Reporting

Report vulnerabilities privately through the maintainer's GitHub profile: https://github.com/FrankFMY

Do not include real private repository data in a public issue or proof of concept.
