import { describe, expect, test } from "vitest";

import { clusterCommits } from "../src/clustering.js";
import type { GitCommit } from "../src/types.js";

function commit(
  index: number,
  subject: string,
  authoredAt: string,
  paths: string[],
): GitCommit {
  return {
    sha: index.toString(16).padStart(40, "0"),
    subject,
    body: "",
    author: { name: "Engineer" },
    authoredAt,
    files: paths.map((filePath) => ({
      path: filePath,
      insertions: 1,
      deletions: 0,
      binary: false,
    })),
  };
}

const input = [
  commit(1, "feat(auth): add session rotation", "2026-08-01T10:00:00.000Z", [
    "src/auth/session.ts",
    "package-lock.json",
  ]),
  commit(
    2,
    "fix(auth): preserve session rotation",
    "2026-08-02T10:00:00.000Z",
    ["src/auth/session.ts", "package-lock.json"],
  ),
  commit(
    3,
    "feat(payment): validate signed request",
    "2026-08-04T10:00:00.000Z",
    ["src/payment/handler.ts", "package-lock.json"],
  ),
  commit(
    4,
    "test(payment): cover signed request replay",
    "2026-08-04T12:00:00.000Z",
    ["tests/payment.test.ts", "package-lock.json"],
  ),
  commit(5, "docs: explain local setup", "2026-08-10T10:00:00.000Z", [
    "README.md",
    "package-lock.json",
  ]),
];

describe("commit clustering", () => {
  test("groups shared-file and nearby topic work while excluding repository-wide hub files", () => {
    const original = structuredClone(input);
    const clusters = clusterCommits(input, {
      maxTemporalGapHours: 48,
      minimumSharedKeywords: 2,
    });

    expect(clusters.map((cluster) => cluster.indices)).toEqual([
      [0, 1],
      [2, 3],
      [4],
    ]);
    expect(clusters[0]?.sharedFiles).toEqual(["src/auth/session.ts"]);
    expect(clusters[1]?.topicKeywords).toEqual([
      "payment",
      "request",
      "signed",
    ]);
    expect(clusters.flatMap((cluster) => cluster.sharedFiles)).not.toContain(
      "package-lock.json",
    );
    expect(input).toEqual(original);
  });

  test("is deterministic for equal data and does not merge temporally distant keyword matches", () => {
    const first = clusterCommits(input, {
      maxTemporalGapHours: 1,
      minimumSharedKeywords: 2,
    });
    const second = clusterCommits(input, {
      maxTemporalGapHours: 1,
      minimumSharedKeywords: 2,
    });
    expect(first).toEqual(second);
    expect(first.map((cluster) => cluster.indices)).toEqual([
      [0, 1],
      [2],
      [3],
      [4],
    ]);
  });

  test("validates clustering bounds", () => {
    expect(() => clusterCommits(input, { maxTemporalGapHours: 0 })).toThrow(
      /maxTemporalGapHours/,
    );
    expect(() => clusterCommits(input, { minimumSharedKeywords: -1 })).toThrow(
      /minimumSharedKeywords/,
    );
    const oversized = Array.from({ length: 2_001 }, (_, index) =>
      commit(
        index + 10,
        `chore: isolated ${index}`,
        new Date(index * 100 * 60 * 60 * 1_000).toISOString(),
        [],
      ),
    );
    expect(() => clusterCommits(oversized)).toThrow(/at most 2000/);
  });
});
