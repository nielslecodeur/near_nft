import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommitRef, parseGitHub, pinnedLink, skillInstall } from "../src/keepers/skills";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("a repo link: every skill folder of the repo goes to ~/.claude/skills, from a fresh temp folder", () => {
  const g = parseGitHub("https://github.com/janestreet/agent_skills");
  assert.deepEqual(g, { owner: "janestreet", repo: "agent_skills", branch: null, commit: null, path: null, url: "https://github.com/janestreet/agent_skills" });
  assert.equal(
    skillInstall("https://github.com/janestreet/agent_skills/")?.claudeCode,
    'd=$(mktemp -d) && git clone -q --depth 1 https://github.com/janestreet/agent_skills "$d" && mkdir -p ~/.claude/skills && for s in "$d"/*/; do [ -f "$s/SKILL.md" ] && cp -r "$s" ~/.claude/skills/; done',
  );
});

test("a folder or SKILL.md link: only that skill, on its branch", () => {
  for (const url of [
    "https://github.com/janestreet/agent_skills/tree/master/socratic-tutor",
    "https://github.com/janestreet/agent_skills/blob/master/socratic-tutor/SKILL.md",
  ]) {
    const i = skillInstall(url);
    assert.equal(i?.path, "socratic-tutor");
    assert.equal(i?.branch, "master");
    assert.equal(
      i?.claudeCode,
      'd=$(mktemp -d) && git clone -q --depth 1 --branch master https://github.com/janestreet/agent_skills "$d" && mkdir -p ~/.claude/skills && cp -r "$d/socratic-tutor" ~/.claude/skills/',
    );
  }
});

test("a link frozen on a commit installs exactly that commit (git clone --branch cannot take a sha)", () => {
  const pinned = pinnedLink("https://github.com/janestreet/agent_skills", SHA);
  assert.equal(pinned, `https://github.com/janestreet/agent_skills/tree/${SHA}`);
  const i = skillInstall(pinned);
  assert.equal(i?.commit, SHA);
  assert.equal(i?.branch, null);
  assert.equal(
    i?.claudeCode,
    `d=$(mktemp -d) && git clone -q --filter=blob:none https://github.com/janestreet/agent_skills "$d" && git -C "$d" checkout -q ${SHA} && mkdir -p ~/.claude/skills && for s in "$d"/*/; do [ -f "$s/SKILL.md" ] && cp -r "$s" ~/.claude/skills/; done`,
  );
  // A folder keeps its path; re-pinning an already pinned link moves it to the new commit.
  assert.equal(
    pinnedLink(`https://github.com/janestreet/agent_skills/tree/master/socratic-tutor`, SHA),
    `https://github.com/janestreet/agent_skills/tree/${SHA}/socratic-tutor`,
  );
  assert.equal(pinnedLink(pinned!, "a".repeat(40)), `https://github.com/janestreet/agent_skills/tree/${"a".repeat(40)}`);
});

test("pinning falls back to a short sha when the full link would pass the contract's 160 bytes", () => {
  const long = `https://github.com/someone/${"r".repeat(60)}/tree/main/${"p".repeat(30)}`;
  const pinned = pinnedLink(long, SHA)!;
  assert.ok(pinned.length <= 160);
  assert.ok(pinned.includes(`/tree/${SHA.slice(0, 12)}/`));
  assert.equal(pinnedLink(long, "not-a-sha"), null);
  assert.ok(isCommitRef("abc1234") && !isCommitRef("main"));
});

test("a .git suffix, www and a trailing query are tolerated", () => {
  assert.equal(parseGitHub("https://www.github.com/a-b/c.d.git?tab=readme")?.repo, "c.d");
});

test("anything that is not a GitHub repo gives nothing to install", () => {
  for (const url of ["https://example.com/agent.json", "github.com/janestreet/agent_skills", "https://github.com/janestreet", "", null])
    assert.equal(skillInstall(url), null, String(url));
});
