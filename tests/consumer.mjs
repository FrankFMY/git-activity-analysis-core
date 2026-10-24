import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanGitRepository,
  analyzeActivity,
  clusterCommits,
  parseConventionalCommit,
  categorizeCommit,
  isConventionalCommit,
  GitAnalysisError,
} from "git-activity-analysis-core";
const fixture = mkdtempSync(join(tmpdir(), "git-activity-installed-"));
const repo = join(fixture, "repo");
mkdirSync(repo);
const git = (...args) =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
try {
  git("init", "-b", "main");
  git("config", "user.name", "Consumer Fixture");
  git("config", "user.email", "fixture@example.test");
  const empty = await scanGitRepository({ repoPath: repo });
  assert.equal(empty.commits.length, 0);
  writeFileSync(join(repo, "shared.ts"), "export const first = 1;\n");
  git("add", "shared.ts");
  git("commit", "-m", "feat(core): add fixture", "-m", "fixture-only-body");
  const firstSha = git("rev-parse", "HEAD");
  git("tag", "-a", "fixture-v1", "-m", "Fixture tag");
  writeFileSync(
    join(repo, "shared.ts"),
    "export const first = 1;\nexport const second = 2;\n",
  );
  writeFileSync(join(repo, " binary asset.bin"), Buffer.from([0, 1, 2]));
  git("add", "shared.ts", " binary asset.bin");
  git("commit", "-m", "fix(core): correct fixture");
  const scan = await scanGitRepository({ repoPath: repo });
  assert.equal(scan.commits.length, 2);
  assert.equal(scan.repository.ref, "main");
  assert.equal(scan.tags[0].targetSha, firstSha);
  assert.ok(scan.commits.every((c) => !c.author.email && c.body === ""));
  assert.ok(!JSON.stringify(scan).includes("fixture-only-body"));
  assert.deepEqual(
    scan.commits[0].files.find((x) => x.path === " binary asset.bin"),
    { path: " binary asset.bin", insertions: 0, deletions: 0, binary: true },
  );
  const raw = await scanGitRepository({
    repoPath: repo,
    includeBody: true,
    includeAuthorEmail: true,
  });
  assert.equal(raw.commits[1].body, "fixture-only-body");
  assert.equal(raw.commits[1].author.email, "fixture@example.test");
  const summary = analyzeActivity(raw.commits);
  assert.deepEqual(summary.totals, {
    commits: 2,
    insertions: 2,
    deletions: 0,
    filesChanged: 2,
  });
  assert.ok(summary.authors.every((x) => !x.email));
  assert.equal(
    analyzeActivity(raw.commits, { includeAuthorEmails: true }).authors[0]
      .email,
    "fixture@example.test",
  );
  assert.equal(clusterCommits(scan.commits).length, 1);
  assert.deepEqual(clusterCommits(scan.commits), clusterCommits(scan.commits));
  const parsed = parseConventionalCommit(
    "feat(api)!: revise contract\n\nBREAKING CHANGE: fixture",
  );
  assert.ok(parsed.isBreaking);
  assert.equal(categorizeCommit(parsed), "feature");
  assert.ok(isConventionalCommit("fix: fixture"));
  const bare = join(fixture, "bare.git");
  git("clone", "--bare", "--no-hardlinks", repo, bare);
  assert.equal(
    (await scanGitRepository({ repoPath: bare })).repository.bare,
    true,
  );
  const worktree = join(fixture, "worktree");
  git("worktree", "add", "--detach", worktree, "HEAD");
  assert.equal(
    (await scanGitRepository({ repoPath: worktree, maxCommits: 1 })).commits
      .length,
    1,
  );
  await assert.rejects(
    scanGitRepository({ repoPath: repo, ref: "--all" }),
    (error) =>
      error instanceof GitAnalysisError && error.code === "INVALID_INPUT",
  );
  console.log(
    "installed real Git scan/privacy/analysis/cluster/bare/worktree consumer: PASS",
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
