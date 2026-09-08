import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("deploy/prune-releases.sh", "utf8");

describe("release and static asset pruning", () => {
  it("requires the current release plus at least one rollback slot", () => {
    expect(script).toContain("KEEP=2");
    expect(script).toContain("--keep must be an integer of at least 2.");
    expect(script).toContain(
      'CURRENT_RELEASE="${TARGET_RELEASE:-${LINKED_CURRENT}}"',
    );
    expect(script).toContain("--rollback)");
    expect(script).toContain('[[ ! -f "${candidate}/.deploy-success" ]]');
  });

  it("builds an unpublished no-clobber union and switches it atomically", () => {
    expect(script).toContain(
      'STATIC_STAGE="$(mktemp -d "${STATIC_ROOT}/.stage.XXXXXXXX")"',
    );
    expect(script).toContain("static-native");
    expect(script).toContain('cp -an "${STATIC_SOURCE}/." "${STATIC_STAGE}/"');
    expect(script).toContain(
      'find -P "${STATIC_STAGE}" -type d -exec chmod 0755 {} +',
    );
    expect(script).toContain(
      'find -P "${STATIC_STAGE}" -type f -exec chmod 0644 {} +',
    );
    expect(script).toContain('mv -Tf "${STATIC_LINK_TMP}" "${STATIC_LINK}"');
    expect(script).toContain(
      '[[ "${LIVE_STATIC_RELEASE}" != "${STATIC_STAGE}" ]]',
    );
  });

  it("removes only releases outside the retained set", () => {
    expect(script).toContain("STATIC_TREE_KEEP=2");
    expect(script).toContain('[[ "${candidate}" == "${CURRENT_RELEASE}" ]]');
    expect(script).toContain('rm -rf -- "${candidate}"');
    expect(script.indexOf("STATIC_PUBLISHED=true")).toBeLessThan(
      script.indexOf('rm -rf -- "${candidate}"'),
    );
  });
});
