import { describe, expect, test } from "vitest";

import {
  GitAnalysisError,
  analyzeActivity,
  categorizeCommit,
  clusterCommits,
  isConventionalCommit,
  parseConventionalCommit,
  scanGitRepository,
} from "../src/index.js";

describe("public package API", () => {
  test("exports the complete dependency-free analysis surface", () => {
    expect(scanGitRepository).toBeTypeOf("function");
    expect(analyzeActivity).toBeTypeOf("function");
    expect(clusterCommits).toBeTypeOf("function");
    expect(parseConventionalCommit).toBeTypeOf("function");
    expect(categorizeCommit).toBeTypeOf("function");
    expect(isConventionalCommit).toBeTypeOf("function");
    expect(GitAnalysisError).toBeTypeOf("function");
  });
});
