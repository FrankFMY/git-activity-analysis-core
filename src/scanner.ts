import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { compareCodePoints } from "./order.js";
import type {
  GitCommit,
  GitFileChange,
  GitScanResult,
  GitTag,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_COMMITS_LIMIT = 2_000;
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,255}$/;

export interface ScanGitRepositoryOptions {
  repoPath: string;
  ref?: string;
  since?: Date;
  until?: Date;
  maxCommits?: number;
  includeBody?: boolean;
  includeAuthorEmail?: boolean;
}

export class GitAnalysisError extends Error {
  readonly code: "INVALID_INPUT" | "NOT_A_REPOSITORY" | "GIT_COMMAND_FAILED";

  constructor(code: GitAnalysisError["code"], message: string) {
    super(message);
    this.name = "GitAnalysisError";
    this.code = code;
  }
}

async function executeGit(
  repoPath: string,
  args: readonly string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_NO_LAZY_FETCH: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
    });
    return stdout;
  } catch {
    throw new GitAnalysisError(
      "GIT_COMMAND_FAILED",
      `git ${args[0] ?? "command"} failed`,
    );
  }
}

async function tryGit(
  repoPath: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    return await executeGit(repoPath, args);
  } catch (error) {
    if (error instanceof GitAnalysisError) return null;
    throw error;
  }
}

function validateDate(value: Date | undefined, name: string): string | null {
  if (value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new GitAnalysisError("INVALID_INPUT", `${name} must be a valid Date`);
  }
  return value.toISOString();
}

function validateOptions(options: ScanGitRepositoryOptions): {
  maxCommits: number;
  since: string | null;
  until: string | null;
} {
  if (typeof options.repoPath !== "string" || options.repoPath.length === 0) {
    throw new GitAnalysisError(
      "INVALID_INPUT",
      "repoPath must be a non-empty string",
    );
  }
  const maxCommits = options.maxCommits ?? 500;
  if (
    !Number.isSafeInteger(maxCommits) ||
    maxCommits < 1 ||
    maxCommits > MAX_COMMITS_LIMIT
  ) {
    throw new GitAnalysisError(
      "INVALID_INPUT",
      `maxCommits must be between 1 and ${MAX_COMMITS_LIMIT}`,
    );
  }
  if (options.ref !== undefined) {
    const ref = options.ref;
    if (
      !REF_PATTERN.test(ref) ||
      ref.startsWith("-") ||
      ref.includes("..") ||
      ref.includes("@{") ||
      ref.includes("//") ||
      ref.endsWith("/") ||
      ref.endsWith(".")
    ) {
      throw new GitAnalysisError(
        "INVALID_INPUT",
        "ref must be a bounded non-option Git revision",
      );
    }
  }
  const since = validateDate(options.since, "since");
  const until = validateDate(options.until, "until");
  if (since && until && since > until) {
    throw new GitAnalysisError(
      "INVALID_INPUT",
      "since must not be later than until",
    );
  }
  return { maxCommits, since, until };
}

function repositoryName(repoPath: string, remote: string | null): string {
  if (remote) {
    const cleaned = remote
      .trim()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\.git$/, "");
    const match = /(?:^|[/:])([^/:]+)$/.exec(cleaned);
    if (match?.[1]) return match[1];
  }
  return (
    path.basename(path.resolve(repoPath)).replace(/\.git$/, "") || "repository"
  );
}

function parseFileChanges(raw: string): GitFileChange[] {
  const files: GitFileChange[] = [];
  for (const rawEntry of raw.split("\0")) {
    const entry = rawEntry.replace(/^\n+/, "");
    if (!entry) continue;
    const firstTab = entry.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : entry.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const insertionsText = entry.slice(0, firstTab);
    const deletionsText = entry.slice(firstTab + 1, secondTab);
    const filePath = entry.slice(secondTab + 1);
    if (!filePath) continue;
    const binary = insertionsText === "-" || deletionsText === "-";
    const insertions = binary ? 0 : Number.parseInt(insertionsText, 10);
    const deletions = binary ? 0 : Number.parseInt(deletionsText, 10);
    if (
      !binary &&
      (!Number.isSafeInteger(insertions) || !Number.isSafeInteger(deletions))
    )
      continue;
    files.push({ path: filePath, insertions, deletions, binary });
  }
  return files.sort((left, right) => compareCodePoints(left.path, right.path));
}

async function readCommit(
  repoPath: string,
  sha: string,
  options: Pick<ScanGitRepositoryOptions, "includeBody" | "includeAuthorEmail">,
): Promise<GitCommit> {
  const metadata = await executeGit(repoPath, [
    "show",
    "--no-patch",
    "--no-show-signature",
    "--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%aI%x00",
    sha,
    "--",
  ]);
  const [
    parsedSha = "",
    subject = "",
    body = "",
    authorName = "Unknown",
    authorEmail = "",
    authoredAt = "",
  ] = metadata.split("\0");
  if (
    !/^[0-9a-f]{40,64}$/.test(parsedSha) ||
    !authoredAt ||
    Number.isNaN(new Date(authoredAt).getTime())
  ) {
    throw new GitAnalysisError(
      "GIT_COMMAND_FAILED",
      "git show returned malformed commit metadata",
    );
  }
  const rawFiles = await executeGit(repoPath, [
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--numstat",
    "-r",
    "-z",
    "--no-renames",
    parsedSha,
    "--",
  ]);
  const author =
    options.includeAuthorEmail && authorEmail
      ? {
          name: authorName || "Unknown",
          email: authorEmail.trim().toLowerCase(),
        }
      : { name: authorName || "Unknown" };
  return {
    sha: parsedSha,
    subject,
    body: options.includeBody ? body.trim() : "",
    author,
    authoredAt: new Date(authoredAt).toISOString(),
    files: parseFileChanges(rawFiles),
  };
}

async function readTags(repoPath: string): Promise<GitTag[]> {
  const names = (await executeGit(repoPath, ["tag", "--list"]))
    .split("\n")
    .filter(Boolean)
    .sort();
  const tags: GitTag[] = [];
  for (const name of names) {
    const targetSha = (
      await executeGit(repoPath, ["rev-list", "-n", "1", `refs/tags/${name}`])
    ).trim();
    const metadata = await executeGit(repoPath, [
      "for-each-ref",
      "--format=%(creatordate:iso-strict)%00%(subject)%00",
      `refs/tags/${name}`,
    ]);
    const [createdAt = "", subject = ""] = metadata.split("\0");
    if (
      !/^[0-9a-f]{40,64}$/.test(targetSha) ||
      Number.isNaN(new Date(createdAt).getTime())
    )
      continue;
    tags.push({
      name,
      targetSha,
      createdAt: new Date(createdAt).toISOString(),
      subject,
    });
  }
  return tags;
}

export async function scanGitRepository(
  options: ScanGitRepositoryOptions,
): Promise<GitScanResult> {
  const validated = validateOptions(options);
  const gitDir = await tryGit(options.repoPath, ["rev-parse", "--git-dir"]);
  if (gitDir === null) {
    throw new GitAnalysisError("NOT_A_REPOSITORY", "not a Git repository");
  }

  const bare =
    (
      await executeGit(options.repoPath, ["rev-parse", "--is-bare-repository"])
    ).trim() === "true";
  const symbolicBranch = (
    await tryGit(options.repoPath, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ])
  )?.trim();
  const requestedRef = options.ref ?? symbolicBranch ?? "HEAD";
  const headExists = (
    await tryGit(options.repoPath, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${requestedRef}^{commit}`,
    ])
  )?.trim();

  if (!headExists) {
    if (options.ref !== undefined) {
      throw new GitAnalysisError(
        "INVALID_INPUT",
        "ref does not resolve to a commit",
      );
    }
    const remote = await tryGit(options.repoPath, [
      "config",
      "--get",
      "remote.origin.url",
    ]);
    return {
      repository: {
        name: repositoryName(options.repoPath, remote),
        ref: requestedRef,
        bare,
      },
      commits: [],
      branches: [],
      tags: [],
    };
  }

  const objectInventory = await executeGit(options.repoPath, [
    "rev-list",
    "--objects",
    "--missing=print",
    headExists,
    "--",
  ]);
  if (objectInventory.split("\n").some((line) => line.startsWith("?"))) {
    throw new GitAnalysisError(
      "GIT_COMMAND_FAILED",
      "repository has missing objects",
    );
  }

  const logArguments = [
    "log",
    "-z",
    "--format=%H",
    `--max-count=${validated.maxCommits}`,
  ];
  if (validated.since) logArguments.push(`--since=${validated.since}`);
  if (validated.until) logArguments.push(`--until=${validated.until}`);
  logArguments.push(headExists, "--");
  const rawShas = await executeGit(options.repoPath, logArguments);
  const shas = rawShas
    .split("\0")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f]{40,64}$/.test(value));
  const commits: GitCommit[] = [];
  for (const sha of shas)
    commits.push(await readCommit(options.repoPath, sha, options));

  const branches = (
    await executeGit(options.repoPath, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
    ])
  )
    .split("\n")
    .filter(Boolean)
    .sort();
  const remote = await tryGit(options.repoPath, [
    "config",
    "--get",
    "remote.origin.url",
  ]);

  return {
    repository: {
      name: repositoryName(options.repoPath, remote),
      ref: options.ref ?? symbolicBranch ?? "HEAD",
      bare,
    },
    commits,
    branches,
    tags: await readTags(options.repoPath),
  };
}
