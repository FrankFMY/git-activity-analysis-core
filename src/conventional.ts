export interface ParsedCommitMessage {
  type: string | null;
  scope: string | null;
  subject: string;
  body: string;
  isBreaking: boolean;
}

export type CommitCategory =
  | "feature"
  | "fix"
  | "refactor"
  | "perf"
  | "docs"
  | "test"
  | "chore"
  | "style"
  | "ci"
  | "unknown";

const CONVENTIONAL =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)\r\n]{1,100})\))?(?<breaking>!)?:\s*(?<subject>\S.*)$/i;
const BREAKING_FOOTER = /(?:^|\n)BREAKING(?: |-)?CHANGE:\s*\S/im;

const CATEGORY_BY_TYPE: Readonly<Record<string, CommitCategory>> = {
  feat: "feature",
  feature: "feature",
  fix: "fix",
  bugfix: "fix",
  hotfix: "fix",
  refactor: "refactor",
  perf: "perf",
  docs: "docs",
  doc: "docs",
  test: "test",
  tests: "test",
  chore: "chore",
  build: "chore",
  style: "style",
  ci: "ci",
};

export function parseConventionalCommit(message: string): ParsedCommitMessage {
  const normalized = message.replace(/\r\n?/g, "\n");
  const [firstLine = "", ...bodyLines] = normalized.split("\n");
  const subjectLine = firstLine.trim();
  const body = bodyLines.join("\n").trim();
  const match = CONVENTIONAL.exec(subjectLine);

  if (!match?.groups) {
    return {
      type: null,
      scope: null,
      subject: subjectLine,
      body,
      isBreaking: BREAKING_FOOTER.test(body),
    };
  }

  return {
    type: match.groups.type?.toLowerCase() ?? null,
    scope: match.groups.scope?.trim() ?? null,
    subject: match.groups.subject?.trim() ?? subjectLine,
    body,
    isBreaking: match.groups.breaking === "!" || BREAKING_FOOTER.test(body),
  };
}

export function categorizeCommit(
  input: string | ParsedCommitMessage,
): CommitCategory {
  const parsed =
    typeof input === "string" ? parseConventionalCommit(input) : input;
  if (parsed.type)
    return CATEGORY_BY_TYPE[parsed.type.toLowerCase()] ?? "unknown";

  const lower = parsed.subject.toLowerCase();
  if (/^(?:fix|repair)\b/.test(lower) || lower.includes("bugfix")) return "fix";
  if (/^(?:add|implement|create)\b/.test(lower)) return "feature";
  if (/^(?:refactor|rewrite)\b/.test(lower)) return "refactor";
  if (/^(?:update dep|bump)\b/.test(lower)) return "chore";
  if (/^(?:test|add test)\b/.test(lower)) return "test";
  if (/^(?:doc|readme)\b/.test(lower)) return "docs";
  return "unknown";
}

export function isConventionalCommit(message: string): boolean {
  const firstLine =
    message.replace(/\r\n?/g, "\n").split("\n", 1)[0]?.trim() ?? "";
  return CONVENTIONAL.test(firstLine);
}
