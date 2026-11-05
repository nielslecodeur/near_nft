import { readFile, writeFile, mkdir } from "node:fs/promises";
const spec = JSON.parse(
  await readFile("design-system/terminal/tokens.json", "utf8"),
);
const dir = "public/design";
await mkdir(dir, { recursive: true });
const variables = Object.entries(spec.tokens).flatMap(([group, values]) =>
  Object.entries(values).map(
    ([name, value]) => `  --${group}-${name}: ${value};`,
  ),
);
const fonts = spec.fonts
  .map(
    (f) =>
      `@font-face { font-family: '${f.family}'; src: url('${f.source}'); font-style: normal; font-weight: ${f.weight}; font-display: swap; }`,
  )
  .join("\n");
await writeFile(
  `${dir}/tokens.css`,
  `/* Generated from design-system/terminal/tokens.json. */\n${fonts}\n:root {\n${variables.join("\n")}\n}\n@media (prefers-reduced-motion: reduce) { :root { --duration-fast: 0ms; --duration-normal: 0ms; --duration-expressive: 0ms; } }\n`,
);
await writeFile(`${dir}/tokens.json`, JSON.stringify(spec, null, 2) + "\n");
const css = (
  await readFile("design-system/terminal/preview.css", "utf8")
).replaceAll("__BP_MOBILE__", spec.tokens.breakpoint.mobile);
await writeFile(
  `${dir}/preview.css`,
  "/* Generated preview stylesheet; layout values resolve from the token source. */\n" +
    css,
);
console.log(
  `Generated ${variables.length} CSS variables, 2 local font faces and the reference stylesheets.`,
);
const primitivesPreview = (
  await readFile("design-system/terminal/primitives-preview.css", "utf8")
).replaceAll("__BP_MOBILE__", spec.tokens.breakpoint.mobile);
await writeFile(
  `${dir}/primitives-preview.css`,
  "/* Generated from design-system/terminal/primitives-preview.css. */\n" +
    primitivesPreview,
);
const components = (
  await readFile("design-system/terminal/components.css", "utf8")
)
  .replaceAll("__BP_MOBILE__", spec.tokens.breakpoint.mobile)
  .replaceAll("__BP_TABLET__", spec.tokens.breakpoint.tablet);
await writeFile(
  `${dir}/components.css`,
  "/* Generated from design-system/terminal/components.css. */\n" + components,
);
const pages = (await readFile("design-system/terminal/pages.css", "utf8"))
  .replaceAll("__BP_MOBILE__", spec.tokens.breakpoint.mobile)
  .replaceAll("__BP_TABLET__", spec.tokens.breakpoint.tablet);
await writeFile(
  "src/terminal/pages.css",
  "/* Generated from design-system/terminal/pages.css. */\n" + pages,
);
const workspace = (
  await readFile("design-system/terminal/workspace.css", "utf8")
)
  .replaceAll("__BP_MOBILE__", spec.tokens.breakpoint.mobile)
  .replaceAll("__BP_TABLET__", spec.tokens.breakpoint.tablet);
await writeFile(
  "src/terminal/workspace.css",
  "/* Generated from design-system/terminal/workspace.css. */\n" + workspace,
);
