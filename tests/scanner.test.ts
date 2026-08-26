import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { GitAnalysisError, scanGitRepository } from "../src/scanner.js";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function createRepository(): {
  root: string;
  firstSha: string;
  secondSha: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), "git-activity-core-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Private Author");
  git(root, "config", "user.email", "private@example.test");
  writeFileSync(path.join(root, "source.ts"), "export const first = 1;\n");
  git(root, "add", "source.ts");
  git(
    root,
    "commit",
    "-m",
    "feat(scanner): add source",
    "-m",
    "private multiline detail\nsecond line",
  );
  const firstSha = git(root, "rev-parse", "HEAD");
  git(root, "tag", "-a", "v0.1.0", "-m", "first release");

  git(root, "mv", "source.ts", "renamed source.ts");
  writeFileSync(path.join(root, "asset.bin"), Buffer.from([0, 1, 2, 3, 4]));
  git(root, "add", "-A");
  git(root, "commit", "-m", "fix: preserve unusual paths and binary stats");
  const secondSha = git(root, "rev-parse", "HEAD");
  return { root, firstSha, secondSha };
}

describe("local git repository scanner", () => {
  test("scans commits, stats, branches, and tags with privacy-safe defaults", async () => {
    const { root, firstSha, secondSha } = createRepository();
    const result = await scanGitRepository({ repoPath: root });

    expect(result.repository.ref).toBe("main");
    expect(result.repository.bare).toBe(false);
    expect(result.branches).toEqual(["main"]);
    expect(result.tags).toEqual([
      expect.objectContaining({
        name: "v0.1.0",
        targetSha: firstSha,
        subject: "first release",
      }),
    ]);
    expect(result.commits.map((commit) => commit.sha)).toEqual([
      secondSha,
      firstSha,
    ]);
    expect(result.commits[0]?.files.map((file) => file.path)).toEqual([
      "asset.bin",
      "renamed source.ts",
      "source.ts",
    ]);
    expect(
      result.commits[0]?.files.find((file) => file.path === "asset.bin"),
    ).toEqual({
      path: "asset.bin",
      insertions: 0,
      deletions: 0,
      binary: true,
    });
    expect(result.commits[1]?.body).toBe("");
    expect(result.commits[1]?.author).toEqual({ name: "Private Author" });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("private multiline detail");
  });

  test("returns bodies and normalized emails only through explicit opt-in", async () => {
    const { root } = createRepository();
    const result = await scanGitRepository({
      repoPath: root,
      includeBody: true,
      includeAuthorEmail: true,
    });
    expect(result.commits.at(-1)?.body).toBe(
      "private multiline detail\nsecond line",
    );
    expect(result.commits.at(-1)?.author.email).toBe("private@example.test");
  });

  test("supports linked worktrees where .git is a file", async () => {
    const { root } = createRepository();
    const worktree = `${root}-worktree`;
    git(root, "worktree", "add", "--detach", worktree, "HEAD");
    const result = await scanGitRepository({
      repoPath: worktree,
      maxCommits: 1,
    });
    expect(result.commits).toHaveLength(1);
    expect(result.repository.bare).toBe(false);
  });

  test("returns an honest empty result for an unborn repository", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "git-activity-empty-"));
    git(root, "init", "-b", "main");
    const result = await scanGitRepository({ repoPath: root });
    expect(result.commits).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.repository.ref).toBe("main");
  });

  test("preserves unusual Git paths instead of trimming their identity", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "git-activity-path-"));
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Engineer");
    git(root, "config", "user.email", "engineer@example.test");
    const unusualPath = "\nleading-name.ts";
    writeFileSync(path.join(root, unusualPath), "export const value = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-m", "test: preserve unusual path identity");

    const result = await scanGitRepository({ repoPath: root });
    expect(result.commits[0]?.files[0]?.path).toBe(unusualPath);
  });

  test("rejects option-like refs and invalid bounds before invoking history traversal", async () => {
    const { root } = createRepository();
    await expect(
      scanGitRepository({ repoPath: root, ref: "--all" }),
    ).rejects.toThrow(/ref/);
    await expect(
      scanGitRepository({ repoPath: root, maxCommits: 0 }),
    ).rejects.toThrow(/maxCommits/);
    await expect(
      scanGitRepository({ repoPath: root, maxCommits: 2_001 }),
    ).rejects.toThrow(/maxCommits/);
  });

  test("does not disclose a private repository path in public errors", async () => {
    const secretPath = path.join(tmpdir(), "customer-private-name", "missing");
    const promise = scanGitRepository({ repoPath: secretPath });
    await expect(promise).rejects.toBeInstanceOf(GitAnalysisError);
    await expect(promise).rejects.not.toThrow(/customer-private-name/);
  });

  test("never lazy-fetches missing objects or executes a promisor remote helper", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "git-activity-promisor-"));
    const repo = path.join(root, "repo");
    mkdirSync(repo);
    git(repo, "init", "-b", "main");
    git(repo, "config", "user.name", "Engineer");
    git(repo, "config", "user.email", "engineer@example.test");
    writeFileSync(path.join(repo, "promised.txt"), "promised contents\n");
    git(repo, "add", "promised.txt");
    git(repo, "commit", "-m", "feat: promised blob");
    const blob = git(repo, "rev-parse", "HEAD:promised.txt");
    const marker = path.join(root, "REMOTE_HELPER_EXECUTED");
    const helper = path.join(root, "helper.sh");
    writeFileSync(helper, `#!/bin/sh\nprintf executed > '${marker}'\nexit 1\n`);
    chmodSync(helper, 0o755);
    git(repo, "remote", "add", "origin", `ext::${helper}`);
    git(repo, "config", "remote.origin.promisor", "true");
    git(repo, "config", "remote.origin.partialclonefilter", "blob:none");
    git(repo, "config", "protocol.ext.allow", "always");
    unlinkSync(
      path.join(repo, ".git", "objects", blob.slice(0, 2), blob.slice(2)),
    );

    await expect(scanGitRepository({ repoPath: repo })).rejects.toBeInstanceOf(
      GitAnalysisError,
    );
    expect(existsSync(marker)).toBe(false);
  });
});
