export { analyzeActivity } from "./analysis.js";
export type { AnalyzeActivityOptions } from "./analysis.js";
export { clusterCommits } from "./clustering.js";
export type { ClusterCommitsOptions, CommitCluster } from "./clustering.js";
export {
  categorizeCommit,
  isConventionalCommit,
  parseConventionalCommit,
} from "./conventional.js";
export type { CommitCategory, ParsedCommitMessage } from "./conventional.js";
export { GitAnalysisError, scanGitRepository } from "./scanner.js";
export type { ScanGitRepositoryOptions } from "./scanner.js";
export type {
  ActivityPeriod,
  ActivitySummary,
  ActivityTotals,
  AuthorActivity,
  CategoryActivity,
  DailyActivity,
  FileActivity,
  GitAuthor,
  GitCommit,
  GitFileChange,
  GitRepositoryIdentity,
  GitScanResult,
  GitTag,
} from "./types.js";
