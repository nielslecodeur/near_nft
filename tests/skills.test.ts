import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHub, skillInstall } from "../src/keepers/skills";

test("a repo link: every skill folder of the repo goes to ~/.claude/skills", () => {
  const g = parseGitHub("https://github.com/janestreet/agent_skills");
  assert.deepEqual(g, { owner: "janestreet", repo: "agent_skills", branch: null, path: null, url: "https://github.com/janestreet/agent_skills" });
  const i = skillInstall("https://github.com/janestreet/agent_skills/");
  assert.equal(
    i?.claudeCode,
    'git clone --depth 1 https://github.com/janestreet/agent_skills /tmp/agent_skills && mkdir -p ~/.claude/skills && for d in /tmp/agent_skills/*/; do [ -f "$d/SKILL.md" ] && cp -r "$d" ~/.claude/skills/; done',
  );
});

test("a folder or SKILL.md link: only that skill, on its branch", () => {
  for (const url of [
    "https://github.com/janestreet/agent_skills/tree/master/socratic-tutor",
    "https://github.com/janestreet/agent_skills/blob/master/socratic-tutor/SKILL.md",
  ]) {
    const i = skillInstall(url);
    assert.equal(i?.path, "socratic-tutor");
    assert.equal(
      i?.claudeCode,
      "git clone --depth 1 --branch master https://github.com/janestreet/agent_skills /tmp/agent_skills && mkdir -p ~/.claude/skills && cp -r /tmp/agent_skills/socratic-tutor ~/.claude/skills/",
    );
  }
});

test("a .git suffix, www and a trailing query are tolerated", () => {
  assert.equal(parseGitHub("https://www.github.com/a-b/c.d.git?tab=readme")?.repo, "c.d");
});

test("anything that is not a GitHub repo gives nothing to install", () => {
  for (const url of ["https://example.com/agent.json", "github.com/janestreet/agent_skills", "https://github.com/janestreet", "", null])
    assert.equal(skillInstall(url), null, String(url));
});
