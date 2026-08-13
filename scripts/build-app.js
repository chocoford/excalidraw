#!/usr/bin/env node

const { execFileSync } = require("child_process");
const path = require("path");

const getCommitSha = () => {
  const environmentSha = [
    process.env.VITE_APP_GIT_SHA,
    process.env.CF_PAGES_COMMIT_SHA,
    process.env.CF_COMMIT_SHA,
    process.env.COMMIT_REF,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA,
  ].find((value) => value?.trim());

  if (environmentSha) {
    return environmentSha.trim();
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
};

const vitePackage = require.resolve("vite/package.json", {
  paths: [path.resolve(__dirname, "..")],
});
const viteEntry = path.join(path.dirname(vitePackage), "bin", "vite.js");

execFileSync(process.execPath, [viteEntry, "build"], {
  cwd: path.resolve(__dirname, "../excalidraw-app"),
  env: {
    ...process.env,
    VITE_APP_ENABLE_TRACKING: "true",
    VITE_APP_GIT_SHA: getCommitSha(),
  },
  stdio: "inherit",
});
