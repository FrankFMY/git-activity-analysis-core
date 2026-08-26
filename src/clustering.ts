import { compareCodePoints } from "./order.js";
import type { GitCommit } from "./types.js";

export interface CommitCluster {
  indices: number[];
  commitShas: string[];
  sharedFiles: string[];
  topicKeywords: string[];
}

export interface ClusterCommitsOptions {
  maxTemporalGapHours?: number;
  minimumSharedKeywords?: number;
  hubFileRatio?: number;
  minimumHubTouches?: number;
}

const MAX_CLUSTER_COMMITS = 2_000;
const MAX_KEYWORDS_PER_COMMIT = 64;
const STOP_WORDS = new Set([
  "add",
  "after",
  "before",
  "build",
  "chore",
  "ci",
  "cover",
  "docs",
  "feat",
  "fix",
  "handle",
  "implement",
  "preserve",
  "refactor",
  "replay",
  "style",
  "test",
  "update",
  "validate",
  "with",
]);

function keywords(subject: string): Set<string> {
  const result = new Set<string>();
  for (const word of subject
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/giu, " ")
    .split(/[\s-]+/u)) {
    if (word.length <= 2 || STOP_WORDS.has(word)) continue;
    result.add(word);
    if (result.size >= MAX_KEYWORDS_PER_COMMIT) break;
  }
  return result;
}

function validatedOptions(
  options: ClusterCommitsOptions,
): Required<ClusterCommitsOptions> {
  const resolved = {
    maxTemporalGapHours: options.maxTemporalGapHours ?? 48,
    minimumSharedKeywords: options.minimumSharedKeywords ?? 2,
    hubFileRatio: options.hubFileRatio ?? 0.5,
    minimumHubTouches: options.minimumHubTouches ?? 3,
  };
  if (
    !Number.isFinite(resolved.maxTemporalGapHours) ||
    resolved.maxTemporalGapHours <= 0
  ) {
    throw new TypeError("maxTemporalGapHours must be finite and positive");
  }
  if (
    !Number.isSafeInteger(resolved.minimumSharedKeywords) ||
    resolved.minimumSharedKeywords < 1 ||
    resolved.minimumSharedKeywords > MAX_KEYWORDS_PER_COMMIT
  ) {
    throw new TypeError(
      `minimumSharedKeywords must be a safe integer between 1 and ${MAX_KEYWORDS_PER_COMMIT}`,
    );
  }
  if (
    !Number.isFinite(resolved.hubFileRatio) ||
    resolved.hubFileRatio <= 0 ||
    resolved.hubFileRatio > 1
  ) {
    throw new TypeError(
      "hubFileRatio must be greater than zero and at most one",
    );
  }
  if (
    !Number.isSafeInteger(resolved.minimumHubTouches) ||
    resolved.minimumHubTouches < 2
  ) {
    throw new TypeError(
      "minimumHubTouches must be a safe integer of at least two",
    );
  }
  return resolved;
}

class DisjointSet {
  readonly #parent: Int32Array;
  readonly #rank: Uint8Array;

  constructor(size: number) {
    this.#parent = Int32Array.from({ length: size }, (_, index) => index);
    this.#rank = new Uint8Array(size);
  }

  find(index: number): number {
    let root = index;
    while (this.#parent[root] !== root) root = this.#parent[root]!;
    while (this.#parent[index] !== index) {
      const next = this.#parent[index]!;
      this.#parent[index] = root;
      index = next;
    }
    return root;
  }

  union(left: number, right: number): void {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const leftRank = this.#rank[leftRoot]!;
    const rightRank = this.#rank[rightRoot]!;
    if (leftRank < rightRank) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    this.#parent[rightRoot] = leftRoot;
    if (leftRank === rightRank) this.#rank[leftRoot] = leftRank + 1;
  }
}

interface KeywordWindow {
  indices: number[];
  start: number;
}

export function clusterCommits(
  commits: readonly GitCommit[],
  options: ClusterCommitsOptions = {},
): CommitCluster[] {
  if (commits.length === 0) return [];
  if (commits.length > MAX_CLUSTER_COMMITS) {
    throw new RangeError(
      `clusterCommits accepts at most ${MAX_CLUSTER_COMMITS} commits`,
    );
  }
  const resolved = validatedOptions(options);
  const dates = commits.map((commit) => {
    const date = new Date(commit.authoredAt);
    if (Number.isNaN(date.getTime()))
      throw new TypeError(`invalid authoredAt for commit ${commit.sha}`);
    return date.getTime();
  });
  const keywordSets = commits.map((commit) => keywords(commit.subject));
  const fileToIndices = new Map<string, number[]>();
  for (const [index, commit] of commits.entries()) {
    for (const filePath of new Set(commit.files.map((file) => file.path))) {
      const indices = fileToIndices.get(filePath) ?? [];
      indices.push(index);
      fileToIndices.set(filePath, indices);
    }
  }
  const hubFiles = new Set(
    [...fileToIndices]
      .filter(
        ([, indices]) =>
          indices.length >= resolved.minimumHubTouches &&
          indices.length / commits.length >= resolved.hubFileRatio,
      )
      .map(([filePath]) => filePath),
  );
  const sets = new DisjointSet(commits.length);

  for (const [filePath, indices] of fileToIndices) {
    if (hubFiles.has(filePath) || indices.length < 2) continue;
    const first = indices[0]!;
    for (let index = 1; index < indices.length; index += 1) {
      sets.union(first, indices[index]!);
    }
  }

  const maxGapMilliseconds = resolved.maxTemporalGapHours * 60 * 60 * 1_000;
  const temporalOrder = Array.from(
    { length: commits.length },
    (_, index) => index,
  ).sort((left, right) => dates[left]! - dates[right]! || left - right);
  const windows = new Map<string, KeywordWindow>();
  for (const current of temporalOrder) {
    const candidateCounts = new Map<number, number>();
    const currentDate = dates[current]!;
    for (const word of keywordSets[current]!) {
      const window = windows.get(word);
      if (!window) continue;
      while (
        window.start < window.indices.length &&
        currentDate - dates[window.indices[window.start]!]! > maxGapMilliseconds
      ) {
        window.start += 1;
      }
      for (
        let position = window.start;
        position < window.indices.length;
        position += 1
      ) {
        const candidate = window.indices[position]!;
        candidateCounts.set(
          candidate,
          (candidateCounts.get(candidate) ?? 0) + 1,
        );
      }
    }
    for (const [candidate, count] of candidateCounts) {
      if (count >= resolved.minimumSharedKeywords)
        sets.union(candidate, current);
    }
    for (const word of keywordSets[current]!) {
      const window = windows.get(word) ?? { indices: [], start: 0 };
      window.indices.push(current);
      windows.set(word, window);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let index = 0; index < commits.length; index += 1) {
    const root = sets.find(index);
    const component = byRoot.get(root) ?? [];
    component.push(index);
    byRoot.set(root, component);
  }

  return [...byRoot.values()]
    .map((indices) => indices.sort((left, right) => left - right))
    .sort((left, right) => left[0]! - right[0]!)
    .map((indices) => {
      const fileCounts = new Map<string, number>();
      const keywordCounts = new Map<string, number>();
      for (const index of indices) {
        for (const filePath of new Set(
          commits[index]!.files.map((file) => file.path),
        )) {
          if (!hubFiles.has(filePath))
            fileCounts.set(filePath, (fileCounts.get(filePath) ?? 0) + 1);
        }
        for (const word of keywordSets[index]!) {
          keywordCounts.set(word, (keywordCounts.get(word) ?? 0) + 1);
        }
      }
      const sharedFiles = [...fileCounts]
        .filter(([, count]) => count >= 2)
        .map(([filePath]) => filePath)
        .sort(compareCodePoints);
      const topicKeywords = [...keywordCounts]
        .filter(([, count]) => count >= 2)
        .sort(
          ([leftWord, leftCount], [rightWord, rightCount]) =>
            rightCount - leftCount || compareCodePoints(leftWord, rightWord),
        )
        .slice(0, 5)
        .map(([word]) => word);
      return {
        indices,
        commitShas: indices.map((index) => commits[index]!.sha),
        sharedFiles,
        topicKeywords,
      };
    });
}
