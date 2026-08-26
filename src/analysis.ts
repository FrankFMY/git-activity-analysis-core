import { categorizeCommit } from "./conventional.js";
import { compareCodePoints } from "./order.js";
import type {
  ActivitySummary,
  AuthorActivity,
  CategoryActivity,
  DailyActivity,
  FileActivity,
  GitCommit,
} from "./types.js";

export interface AnalyzeActivityOptions {
  includeAuthorEmails?: boolean;
  topFileLimit?: number;
}

interface MutableDailyActivity extends DailyActivity {}
interface MutableFileActivity extends FileActivity {}
interface MutableAuthor {
  name: string;
  email?: string;
  commits: number;
}

function validateCommit(commit: GitCommit): Date {
  const date = new Date(commit.authoredAt);
  if (Number.isNaN(date.getTime()))
    throw new TypeError(`invalid authoredAt for commit ${commit.sha}`);
  for (const file of commit.files) {
    if (!file.path)
      throw new TypeError(
        `file path must be non-empty for commit ${commit.sha}`,
      );
    for (const [field, value] of [
      ["insertions", file.insertions],
      ["deletions", file.deletions],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(
          `${field} must be a non-negative safe integer for commit ${commit.sha}`,
        );
      }
    }
  }
  return date;
}

function normalizedAuthorKey(commit: GitCommit): string {
  const email = commit.author.email?.trim().toLowerCase();
  return email
    ? `email:${email}`
    : `name:${commit.author.name.trim().toLowerCase()}`;
}

export function analyzeActivity(
  commits: readonly GitCommit[],
  options: AnalyzeActivityOptions = {},
): ActivitySummary {
  const topFileLimit = options.topFileLimit ?? 20;
  if (
    !Number.isSafeInteger(topFileLimit) ||
    topFileLimit < 0 ||
    topFileLimit > 1_000
  ) {
    throw new TypeError(
      "topFileLimit must be a safe integer between 0 and 1000",
    );
  }

  let insertions = 0;
  let deletions = 0;
  const uniqueFiles = new Set<string>();
  const dates: Date[] = [];
  const dayMap = new Map<string, MutableDailyActivity>();
  const categoryMap = new Map<string, number>();
  const authorMap = new Map<string, MutableAuthor>();
  const fileMap = new Map<string, MutableFileActivity>();

  for (const commit of commits) {
    const date = validateCommit(commit);
    dates.push(date);
    const day = date.toISOString().slice(0, 10);
    const daily = dayMap.get(day) ?? {
      date: day,
      commits: 0,
      insertions: 0,
      deletions: 0,
    };
    daily.commits += 1;
    dayMap.set(day, daily);

    const category = categorizeCommit(`${commit.subject}\n${commit.body}`);
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);

    const authorKey = normalizedAuthorKey(commit);
    const normalizedEmail = commit.author.email?.trim().toLowerCase();
    const existingAuthor = authorMap.get(authorKey);
    if (existingAuthor) {
      existingAuthor.commits += 1;
    } else {
      const author: MutableAuthor = { name: commit.author.name, commits: 1 };
      if (normalizedEmail) author.email = normalizedEmail;
      authorMap.set(authorKey, author);
    }

    const seenInCommit = new Set<string>();
    for (const file of commit.files) {
      insertions += file.insertions;
      deletions += file.deletions;
      daily.insertions += file.insertions;
      daily.deletions += file.deletions;
      uniqueFiles.add(file.path);

      const fileActivity = fileMap.get(file.path) ?? {
        path: file.path,
        commits: 0,
        insertions: 0,
        deletions: 0,
      };
      if (!seenInCommit.has(file.path)) fileActivity.commits += 1;
      fileActivity.insertions += file.insertions;
      fileActivity.deletions += file.deletions;
      fileMap.set(file.path, fileActivity);
      seenInCommit.add(file.path);
    }
  }

  const sortedDates = [...dates].sort(
    (left, right) => left.getTime() - right.getTime(),
  );
  const authors: AuthorActivity[] = [...authorMap.values()]
    .sort(
      (left, right) =>
        right.commits - left.commits ||
        compareCodePoints(left.name, right.name),
    )
    .map((author) =>
      options.includeAuthorEmails && author.email
        ? { name: author.name, email: author.email, commits: author.commits }
        : { name: author.name, commits: author.commits },
    );

  const byCategory: CategoryActivity[] = [...categoryMap.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([category, count]) => ({
      category: category as CategoryActivity["category"],
      commits: count,
    }));

  const topFiles = [...fileMap.values()]
    .sort(
      (left, right) =>
        right.commits - left.commits ||
        right.insertions +
          right.deletions -
          (left.insertions + left.deletions) ||
        compareCodePoints(left.path, right.path),
    )
    .slice(0, topFileLimit);

  return {
    totals: {
      commits: commits.length,
      insertions,
      deletions,
      filesChanged: uniqueFiles.size,
    },
    period: {
      first: sortedDates[0]?.toISOString() ?? null,
      last: sortedDates.at(-1)?.toISOString() ?? null,
    },
    byDay: [...dayMap.values()].sort((left, right) =>
      compareCodePoints(left.date, right.date),
    ),
    byCategory,
    authors,
    topFiles,
  };
}
