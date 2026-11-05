function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
async function init() {
  const r = await fetch("/design/tokens.json");
  if (!r.ok) throw Error("Source des tokens indisponible.");
  const spec = await r.json(),
    t = spec.tokens;
  const names = {
    bg: "Fond",
    s1: "Surface 1",
    s2: "Surface 2",
    s3: "Surface 3",
  };
  for (const key of ["bg", "s1", "s2", "s3"]) {
    const item = node("div", null, "surface-item");
    item.dataset.level = key;
    const swatch = node("div", null, "surface-swatch");
    swatch.style.setProperty("--sample-surface", `var(--color-${key})`);
    swatch.style.setProperty("--sample-shadow", `var(--shadow-${key})`);
    item.append(
      swatch,
      node("h3", names[key]),
      node("code", t.color[key], "token-value mono"),
    );
    document.getElementById("surfaces").append(item);
  }
  for (const [key, label] of [
    ["brand", "Accent Everkeep"],
    ["up", "Hausse"],
    ["down", "Baisse"],
    ["text", "Texte principal"],
    ["muted", "Texte secondaire"],
    ["border", "Bordure"],
  ]) {
    const item = node("div", null, "color-item"),
      swatch = node("div", null, "color-swatch");
    swatch.style.setProperty("--sample-color", `var(--color-${key})`);
    const labelGroup = node("div");
    labelGroup.append(
      node("h3", label),
      node("code", t.color[key], "token-value mono"),
    );
    item.append(swatch, labelGroup);
    document.getElementById("colors").append(item);
  }
  const sizeLabels = {
    xs: "Métadonnées",
    sm: "Libellés et contrôles",
    body: "Texte courant",
    lead: "Introduction courte",
    title: "Titre de section",
    heading: "Titre de page",
    display: "Titre de présentation",
  };
  for (const [key, value] of Object.entries(t.type)) {
    const row = node("div"),
      sample = node("span", sizeLabels[key]);
    sample.style.fontSize = `var(--type-${key})`;
    row.append(node("code", value), sample);
    document.getElementById("type-scale").append(row);
  }
  for (const [key, value] of Object.entries(t.space).filter(
    ([key]) => key !== "0",
  )) {
    const row = node("div", null, "spacing-item"),
      bar = node("span", null, "spacing-bar");
    bar.style.setProperty("--sample-space", `var(--space-${key})`);
    row.append(node("code", value), bar);
    document.getElementById("spacing").append(row);
  }
  for (const [key, value] of Object.entries(t.radius)) {
    const item = node("div"),
      shape = node("div", null, "radius-shape");
    shape.style.setProperty("--sample-radius", `var(--radius-${key})`);
    item.append(shape, node("code", value, "radius-label"));
    document.getElementById("radii").append(item);
  }
  const durations = {
    fast: "Retour d’interaction",
    normal: "Transition courante",
    expressive: "Changement de surface",
  };
  for (const [key, value] of Object.entries(t.duration)) {
    const row = node("div", null, "motion-row");
    row.append(node("span", durations[key]), node("code", value));
    document.getElementById("motion").append(row);
  }
  document.getElementById("loading").remove();
  document.documentElement.dataset.tokensReady = "true";
}
init().catch((e) => {
  const p = document.getElementById("loading");
  p.className = "error";
  p.textContent =
    "La référence n’a pas pu être chargée. Rechargez cette page pour réessayer.";
  console.error(e);
});
