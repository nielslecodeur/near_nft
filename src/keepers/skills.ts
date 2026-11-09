/** Agent skills found on GitHub: parse the link, pin it to a commit, say how to install it. No browser dependency (unit-tested). */

/** A commit id in a link ("tree/<sha>"): 7 to 40 hex characters. */
export const isCommitRef = (ref: string | null | undefined) => !!ref && /^[0-9a-f]{7,40}$/i.test(ref);

/** A github.com link, split: whole repo, or one folder (tree/blob) on a branch or a commit. */
export function parseGitHub(url: string | null | undefined) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/([^?#]*))?)?\/?(?:[?#].*)?$/.exec(
    (url ?? "").trim(),
  );
  if (!m) return null;
  const path = (m[4] ?? "").replace(/\/?SKILL\.md$/i, "").replace(/\/$/, "");
  const ref = m[3] ?? null;
  return {
    owner: m[1],
    repo: m[2],
    branch: ref && !isCommitRef(ref) ? ref : null,
    /** Set when the link is frozen on one commit. */
    commit: isCommitRef(ref) ? ref!.toLowerCase() : null,
    path: path || null,
    url: `https://github.com/${m[1]}/${m[2]}`,
  };
}

/** The same skill, frozen on `sha`: "https://github.com/o/r/tree/<sha>[/path]" (short sha if the full link would not fit). */
export function pinnedLink(url: string, sha: string, maxLength = 160) {
  const g = parseGitHub(url);
  if (!g || !isCommitRef(sha)) return null;
  const make = (s: string) => `${g.url}/tree/${s}${g.path ? `/${g.path}` : ""}`;
  const full = make(sha.toLowerCase());
  if (full.length <= maxLength) return full;
  const short = make(sha.toLowerCase().slice(0, 12));
  return short.length <= maxLength ? short : null;
}

/**
 * How to install the skill(s) behind a GitHub link into Claude Code, which reads
 * personal skills from ~/.claude/skills/<name>/SKILL.md. A repo link copies every
 * top-level folder that holds a SKILL.md; a folder link copies that folder. A
 * link frozen on a commit installs exactly that commit. Clones go to a fresh
 * temporary folder, so running it twice works.
 */
export function skillInstall(url: string | null | undefined) {
  const g = parseGitHub(url);
  if (!g) return null;
  const fetch = g.commit
    ? `git clone -q --filter=blob:none ${g.url} "$d" && git -C "$d" checkout -q ${g.commit}`
    : `git clone -q --depth 1${g.branch ? ` --branch ${g.branch}` : ""} ${g.url} "$d"`;
  const copy = g.path
    ? `cp -r "$d/${g.path}" ~/.claude/skills/`
    : `for s in "$d"/*/; do [ -f "$s/SKILL.md" ] && cp -r "$s" ~/.claude/skills/; done`;
  return {
    ...g,
    claudeCode: `d=$(mktemp -d) && ${fetch} && mkdir -p ~/.claude/skills && ${copy}`,
    what: g.path ? `the skill in ${g.path}` : "every skill folder (a folder with a SKILL.md) of the repo",
  };
}
