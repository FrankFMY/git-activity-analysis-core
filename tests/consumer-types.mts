import {
  scanGitRepository,
  analyzeActivity,
  clusterCommits,
  categorizeCommit,
} from "git-activity-analysis-core";
import type {
  GitScanResult,
  ActivitySummary,
  CommitCategory,
} from "git-activity-analysis-core";
const scan: GitScanResult = await scanGitRepository({
  repoPath: ".",
  maxCommits: 1,
});
const summary: ActivitySummary = analyzeActivity(scan.commits);
const category: CommitCategory = categorizeCommit("feat: example");
clusterCommits(scan.commits, { maxTemporalGapHours: 1 });
// @ts-expect-error repository path is required
scanGitRepository({ maxCommits: 1 });
// @ts-expect-error privacy opt-in is boolean, not a string
scanGitRepository({ repoPath: ".", includeAuthorEmail: "yes" });
// @ts-expect-error summary commit count is numeric
const invalid: string = summary.totals.commits;
void [category, invalid];
