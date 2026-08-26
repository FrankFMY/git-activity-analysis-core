import { describe, expect, test } from "vitest";

import {
  categorizeCommit,
  isConventionalCommit,
  parseConventionalCommit,
} from "../src/conventional.js";

describe("conventional commit parsing", () => {
  test("parses scope, bang, multiline body, and BREAKING CHANGE footer", () => {
    const parsed = parseConventionalCommit(
      "feat(scanner)!: preserve multiline subjects safely\n\nImplementation detail.\n\nBREAKING CHANGE: scanner output is privacy-redacted by default",
    );

    expect(parsed).toEqual({
      type: "feat",
      scope: "scanner",
      subject: "preserve multiline subjects safely",
      body: "Implementation detail.\n\nBREAKING CHANGE: scanner output is privacy-redacted by default",
      isBreaking: true,
    });
    expect(categorizeCommit(parsed)).toBe("feature");
    expect(
      isConventionalCommit(
        "feat(scanner)!: preserve multiline subjects safely",
      ),
    ).toBe(true);
  });

  test("detects a breaking footer without a bang", () => {
    const parsed = parseConventionalCommit(
      "fix: keep identities private\n\nBREAKING-CHANGE: email output is now opt-in",
    );
    expect(parsed.isBreaking).toBe(true);
    expect(categorizeCommit(parsed)).toBe("fix");
  });

  test("preserves non-conventional text and categorizes bounded common prefixes", () => {
    const parsed = parseConventionalCommit(
      "Implement deterministic daily summaries\n\nNo API changes.",
    );
    expect(parsed.type).toBeNull();
    expect(parsed.subject).toBe("Implement deterministic daily summaries");
    expect(parsed.body).toBe("No API changes.");
    expect(parsed.isBreaking).toBe(false);
    expect(categorizeCommit(parsed)).toBe("feature");
    expect(isConventionalCommit(parsed.subject)).toBe(false);
  });
});
