/** Agent skills found on GitHub: parse the link, say how to install them. No browser dependency (unit-tested). */

/** A github.com link, split: whole repo, or one folder (tree/blob) on a branch. */
export function parseGitHub(url: string | null | undefined) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/([^?#]*))?)?\/?(?:[?#].*)?$/.exec(
    (url ?? "").trim(),
  );
  if (!m) return null;
  const path = (m[4] ?? "").replace(/\/?SKILL\.md$/i, "").replace(/\/$/, "");
  return { owner: m[1], repo: m[2], branch: m[3] ?? null, path: path || null, url: `https://github.com/${m[1]}/${m[2]}` };
}

/**
 * How to install the skill(s) behind a GitHub link into Claude Code, which reads
 * personal skills from ~/.claude/skills/<name>/SKILL.md. A repo link copies every
 * top-level folder that holds a SKILL.md; a folder link copies that folder.
 */
export function skillInstall(url: string | null | undefined) {
  const g = parseGitHub(url);
  if (!g) return null;
  const tmp = `/tmp/${g.repo}`;
  const clone = `git clone --depth 1${g.branch ? ` --branch ${g.branch}` : ""} ${g.url} ${tmp}`;
  const copy = g.path
    ? `cp -r ${tmp}/${g.path} ~/.claude/skills/`
    : `for d in ${tmp}/*/; do [ -f "$d/SKILL.md" ] && cp -r "$d" ~/.claude/skills/; done`;
  return {
    ...g,
    claudeCode: `${clone} && mkdir -p ~/.claude/skills && ${copy}`,
    what: g.path ? `the skill in ${g.path}` : "every skill folder (a folder with a SKILL.md) of the repo",
  };
}
