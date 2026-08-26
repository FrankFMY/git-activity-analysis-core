import { clusterCommits } from "../dist/index.js";

const count = 2_000;
const commits = Array.from({ length: count }, (_, index) => ({
  sha: index.toString(16).padStart(40, "0"),
  subject: "feat: common bounded topic",
  body: "",
  author: { name: "Stress fixture" },
  authoredAt: "2026-08-26T00:00:00.000Z",
  files: [],
}));
const started = performance.now();
const clusters = clusterCommits(commits);
if (clusters.length !== 1 || clusters[0]?.indices.length !== count) {
  throw new Error("worst-case clustering produced an invalid component");
}
console.log(
  JSON.stringify({
    commits: count,
    clusters: clusters.length,
    elapsedMs: Math.round(performance.now() - started),
  }),
);
