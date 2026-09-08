import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("deploy/prune-releases.sh");

function createFixture() {
  const appRoot = mkdtempSync(path.join(tmpdir(), "ai-price-pruner-"));
  const releasesRoot = path.join(appRoot, "releases");
  const dependenciesRoot = path.join(appRoot, "shared", "dependencies");
  mkdirSync(releasesRoot, { recursive: true });
  mkdirSync(dependenciesRoot, { recursive: true });

  return { appRoot, releasesRoot, dependenciesRoot };
}

function createDependency(dependenciesRoot: string, character: string) {
  const dependencyPath = path.join(dependenciesRoot, character.repeat(64));
  mkdirSync(path.join(dependencyPath, "node_modules"), { recursive: true });
  writeFileSync(path.join(dependencyPath, "node_modules", "marker"), character);
  return dependencyPath;
}

function createRelease(
  releasesRoot: string,
  name: string,
  dependencyPath: string,
  ready = true,
) {
  const releasePath = path.join(releasesRoot, name);
  mkdirSync(releasePath);
  symlinkSync(
    path.join(dependencyPath, "node_modules"),
    path.join(releasePath, "node_modules"),
  );
  if (ready) {
    writeFileSync(path.join(releasePath, ".release-ready"), "");
  }
  return releasePath;
}

describe("release pruner", () => {
  it("keeps the current and newest releases and removes only orphaned dependencies", () => {
    const { appRoot, releasesRoot, dependenciesRoot } = createFixture();
    const oldDependency = createDependency(dependenciesRoot, "a");
    const sharedDependency = createDependency(dependenciesRoot, "b");
    const orphanDependency = createDependency(dependenciesRoot, "c");
    const oldRelease = createRelease(
      releasesRoot,
      "20260101000000000001",
      oldDependency,
    );
    const previousRelease = createRelease(
      releasesRoot,
      "20260101000000000002",
      sharedDependency,
    );
    const currentRelease = createRelease(
      releasesRoot,
      "20260101000000000003",
      sharedDependency,
    );
    const incompleteRelease = createRelease(
      releasesRoot,
      "20260101000000000004",
      orphanDependency,
      false,
    );
    symlinkSync(currentRelease, path.join(appRoot, "current"));

    execFileSync("bash", [script], {
      env: {
        ...process.env,
        AI_PRICE_APP_ROOT: appRoot,
        AI_PRICE_RELEASES_TO_KEEP: "2",
      },
    });

    expect(() => readlinkSync(path.join(appRoot, "current"))).not.toThrow();
    expect(() =>
      readlinkSync(path.join(previousRelease, "node_modules")),
    ).not.toThrow();
    expect(() =>
      readlinkSync(path.join(currentRelease, "node_modules")),
    ).not.toThrow();
    expect(existsSync(oldRelease)).toBe(false);
    expect(existsSync(incompleteRelease)).toBe(false);
    expect(existsSync(oldDependency)).toBe(false);
    expect(existsSync(orphanDependency)).toBe(false);
    expect(existsSync(path.join(sharedDependency, "node_modules"))).toBe(true);
  });

  it("refuses an invalid current symlink without deleting releases", () => {
    const { appRoot, releasesRoot, dependenciesRoot } = createFixture();
    const dependency = createDependency(dependenciesRoot, "d");
    const release = createRelease(
      releasesRoot,
      "20260101000000000001",
      dependency,
    );
    symlinkSync(tmpdir(), path.join(appRoot, "current"));

    expect(() =>
      execFileSync("bash", [script], {
        env: { ...process.env, AI_PRICE_APP_ROOT: appRoot },
        stdio: "pipe",
      }),
    ).toThrow();
    expect(() =>
      readlinkSync(path.join(release, "node_modules")),
    ).not.toThrow();
  });
});
