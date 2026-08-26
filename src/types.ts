import type { CommitCategory } from "./conventional.js";

export interface GitAuthor {
  name: string;
  email?: string;
}

export interface GitFileChange {
  path: string;
  insertions: number;
  deletions: number;
  binary: boolean;
}

export interface GitCommit {
  sha: string;
  subject: string;
  body: string;
  author: GitAuthor;
  authoredAt: string;
  files: GitFileChange[];
}

export interface GitTag {
  name: string;
  targetSha: string;
  createdAt: string;
  subject: string;
}

export interface GitRepositoryIdentity {
  name: string;
  ref: string;
  bare: boolean;
}

export interface GitScanResult {
  repository: GitRepositoryIdentity;
  commits: GitCommit[];
  branches: string[];
  tags: GitTag[];
}

export interface ActivityTotals {
  commits: number;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface ActivityPeriod {
  first: string | null;
  last: string | null;
}

export interface DailyActivity {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface CategoryActivity {
  category: CommitCategory;
  commits: number;
}

export interface AuthorActivity {
  name: string;
  email?: string;
  commits: number;
}

export interface FileActivity {
  path: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface ActivitySummary {
  totals: ActivityTotals;
  period: ActivityPeriod;
  byDay: DailyActivity[];
  byCategory: CategoryActivity[];
  authors: AuthorActivity[];
  topFiles: FileActivity[];
}
