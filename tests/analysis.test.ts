import { describe, expect, test } from "vitest";

import { analyzeActivity } from "../src/analysis.js";
import type { GitCommit } from "../src/types.js";

const commits: GitCommit[] = [
  {
    sha: "a".repeat(40),
    subject: "feat(api): add bounded scan",
    body: "",
    author: { name: "Alice", email: "alice@example.com" },
    authoredAt: "2026-08-01T23:30:00.000Z",
    files: [
      { path: "src/scan.ts", insertions: 10, deletions: 1, binary: false },
      { path: "README.md", insertions: 2, deletions: 0, binary: false },
    ],
  },
  {
    sha: "b".repeat(40),
    subject: "fix: handle empty repository",
    body: "",
    author: { name: "ALICE", email: "ALICE@example.com" },
    authoredAt: "2026-08-02T00:30:00.000Z",
    files: [
      { path: "src/scan.ts", insertions: 3, deletions: 2, binary: false },
    ],
  },
  {
    sha: "c".repeat(40),
    subject: "Document privacy defaults",
    body: "",
    author: { name: "Bob", email: "bob@example.com" },
    authoredAt: "2026-08-02T10:00:00.000Z",
    files: [{ path: "README.md", insertions: 5, deletions: 0, binary: false }],
  },
];

describe("activity analysis", () => {
  test("produces stable UTC aggregates without exposing author emails by default", () => {
    const original = structuredClone(commits);
    const result = analyzeActivity(commits);

    expect(result.totals).toEqual({
      commits: 3,
      insertions: 20,
      deletions: 3,
      filesChanged: 2,
    });
    expect(result.period).toEqual({
      first: "2026-08-01T23:30:00.000Z",
      last: "2026-08-02T10:00:00.000Z",
    });
    expect(result.byDay).toEqual([
      { date: "2026-08-01", commits: 1, insertions: 12, deletions: 1 },
      { date: "2026-08-02", commits: 2, insertions: 8, deletions: 2 },
    ]);
    expect(result.byCategory).toEqual([
      { category: "feature", commits: 1 },
      { category: "fix", commits: 1 },
      { category: "unknown", commits: 1 },
    ]);
    expect(result.authors).toEqual([
      { name: "Alice", commits: 2 },
      { name: "Bob", commits: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("@example.com");
    expect(result.topFiles).toEqual([
      { path: "src/scan.ts", commits: 2, insertions: 13, deletions: 3 },
      { path: "README.md", commits: 2, insertions: 7, deletions: 0 },
    ]);
    expect(commits).toEqual(original);
  });

  test("exposes normalized author emails only when explicitly requested", () => {
    expect(
      analyzeActivity(commits, { includeAuthorEmails: true }).authors,
    ).toEqual([
      { name: "Alice", email: "alice@example.com", commits: 2 },
      { name: "Bob", email: "bob@example.com", commits: 1 },
    ]);
  });

  test("rejects malformed dates and negative change counts instead of producing misleading totals", () => {
    expect(() =>
      analyzeActivity([{ ...commits[0]!, authoredAt: "not-a-date" }]),
    ).toThrow(/authoredAt/);
    expect(() =>
      analyzeActivity([
        {
          ...commits[0]!,
          files: [
            {
              path: "src/scan.ts",
              insertions: -1,
              deletions: 0,
              binary: false,
            },
          ],
        },
      ]),
    ).toThrow(/non-negative/);
  });

  test("uses locale-independent code-point ordering", () => {
    const names = ["zeta", "äther", "åland", "alpha"];
    const unicodeCommits = names.map((name, index): GitCommit => ({
      sha: index.toString(16).padStart(40, "0"),
      subject: "chore: unicode ordering",
      body: "",
      author: { name },
      authoredAt: `2026-08-0${index + 1}T00:00:00.000Z`,
      files: [
        {
          path: `${name}.ts`,
          insertions: 1,
          deletions: 0,
          binary: false,
        },
      ],
    }));
    const result = analyzeActivity(unicodeCommits);
    expect(result.authors.map((author) => author.name)).toEqual([
      "alpha",
      "zeta",
      "äther",
      "åland",
    ]);
    expect(result.topFiles.map((file) => file.path)).toEqual([
      "alpha.ts",
      "zeta.ts",
      "äther.ts",
      "åland.ts",
    ]);
  });
});
