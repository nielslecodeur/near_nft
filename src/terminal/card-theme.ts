export type CardTheme = {
  rarity: "standard" | "rare" | "epic" | "legendary";
  frame: "matte" | "metal" | "holo" | "animated";
  palette: { accent: "brand" | "up" | "down"; surface: "s1" | "s2" | "s3" };
  layers: {
    src: string;
    depth: "background" | "subject" | "foreground";
    opacity: number;
  }[];
  liveFeed: boolean;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Un thème doit être un objet JSON.");
  return value as Record<string, unknown>;
};
function choice<T extends string>(
  v: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof v !== "string" || !choices.includes(v as T))
    throw Error(`${label} non reconnu.`);
  return v as T;
}
export function parseCardTheme(value: unknown): CardTheme {
  const t = record(value),
    palette = record(t.palette);
  if (!Array.isArray(t.layers) || !t.layers.length || t.layers.length > 3)
    throw Error("Le thème doit contenir un à trois calques.");
  const layers = t.layers.map((value) => {
    const l = record(value);
    if (
      typeof l.src !== "string" ||
      (l.src !== "$art" &&
        !/^\/art\/[a-zA-Z0-9_/-]+\.(svg|png|webp)$/.test(l.src)) ||
      l.src.includes("..")
    )
      throw Error(
        "Utilisez $art ou un fichier local dans /art/ pour chaque calque.",
      );
    if (
      typeof l.opacity !== "number" ||
      !Number.isFinite(l.opacity) ||
      l.opacity < 0 ||
      l.opacity > 1
    )
      throw Error("L’opacité doit être comprise entre 0 et 1.");
    return {
      src: l.src,
      depth: choice(
        l.depth,
        ["background", "subject", "foreground"],
        "Profondeur",
      ),
      opacity: l.opacity,
    };
  });
  if (typeof t.liveFeed !== "boolean")
    throw Error("liveFeed doit être true ou false.");
  return {
    rarity: choice(
      t.rarity,
      ["standard", "rare", "epic", "legendary"],
      "Rareté",
    ),
    frame: choice(t.frame, ["matte", "metal", "holo", "animated"], "Matériau"),
    palette: {
      accent: choice(palette.accent, ["brand", "up", "down"], "Accent"),
      surface: choice(palette.surface, ["s1", "s2", "s3"], "Surface"),
    },
    layers,
    liveFeed: t.liveFeed,
  };
}
