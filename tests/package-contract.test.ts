import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

interface PackageManifest {
  files?: string[];
  scripts?: Record<string, string>;
}

describe("package distribution contract", () => {
  test("builds dist when installed directly from Git", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageManifest;
    expect(manifest.files).toContain("dist");
    expect(manifest.scripts?.prepare).toBe("npm run build");
  });
});
