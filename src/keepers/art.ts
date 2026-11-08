/**
 * Front-end Keeper portrait, 4:3, drawn from the on-chain `dna` and `tier`.
 * Trait selection mirrors contracts/keepers/src/art.rs exactly (same palettes,
 * same bit slices), so the same Keeper is recognisable in wallets (on-chain
 * square SVG) and here. This version is framed for CardFrame: larger subject,
 * no border (CardFrame draws the frame material for the tier).
 */
const BACKGROUNDS = [
  "#b5f36b",
  "#7cc6fe",
  "#f7a8c4",
  "#ffd166",
  "#c3aed6",
  "#9be7c4",
];
const SHELLS = [
  "#f4f1de",
  "#e07a5f",
  "#3d405b",
  "#81b29a",
  "#f2cc8f",
  "#5e60ce",
  "#ef476f",
  "#2b2d42",
];
const GLOWS = ["#b5f36b", "#7cf6ff", "#ff6ad5", "#ffe66d", "#ffffff"];
export const TIER_LABELS = [
  "Matte",
  "Brushed",
  "Holographic",
  "Animated",
] as const;
export const VISORS = [
  "Twin lights",
  "Keyhole",
  "Scanner",
  "Smile",
  "Square",
] as const;
export const ACCESSORIES = [
  "None",
  "Antenna",
  "Headphones",
  "Crown",
  "Halo",
  "Horns",
] as const;

export function traits(dna: number) {
  return {
    background: BACKGROUNDS[dna % 6],
    shell: SHELLS[(dna >>> 4) % 8],
    visor: (dna >>> 8) % 5,
    accessory: (dna >>> 12) % 6,
    glow: GLOWS[(dna >>> 16) % 5],
  };
}

export function keeperSvg(dna: number, tier: number): string {
  const t = traits(dna >>> 0);
  const ink = "#0b0f14";
  const g = t.glow;
  // Creature centred at (200, 172) in a 400x300 canvas.
  const material =
    tier === 0
      ? ""
      : tier === 1
        ? `<linearGradient id='m' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.6'/><stop offset='.35' stop-color='#9aa3ad' stop-opacity='.15'/><stop offset='.5' stop-color='#fff' stop-opacity='.5'/><stop offset='.7' stop-color='#5c6670' stop-opacity='.25'/><stop offset='1' stop-color='#fff' stop-opacity='.45'/></linearGradient>`
        : `<linearGradient id='m' x1='0' y1='0' x2='1' y2='1'>${tier >= 3 ? "<animateTransform attributeName='gradientTransform' type='rotate' from='0 .5 .5' to='360 .5 .5' dur='6s' repeatCount='indefinite'/>" : ""}<stop offset='0' stop-color='#ff6ad5'/><stop offset='.25' stop-color='#ffe66d'/><stop offset='.5' stop-color='#7cf6ff'/><stop offset='.75' stop-color='#b5f36b'/><stop offset='1' stop-color='#c3aed6'/></linearGradient>`;
  const overlay =
    tier === 0
      ? ""
      : `<ellipse cx='200' cy='180' rx='112' ry='104' fill='url(#m)' opacity='${tier === 1 ? 1 : 0.55}'/>`;
  const eyes = [
    `<circle cx='166' cy='158' r='13' fill='${g}'/><circle cx='234' cy='158' r='13' fill='${g}'/>`,
    `<circle cx='200' cy='151' r='12' fill='${g}'/><path d='M193 157h14l4 17h-22z' fill='${g}'/>`,
    `<rect x='142' y='151' width='116' height='14' rx='7' fill='${g}'/>`,
    `<path d='M152 166l14-16 14 16M220 166l14-16 14 16' stroke='${g}' stroke-width='8' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`,
    `<rect x='152' y='145' width='30' height='26' rx='4' fill='${g}'/><rect x='218' y='145' width='30' height='26' rx='4' fill='${g}'/>`,
  ][t.visor];
  const top = [
    "",
    `<path d='M200 78V40' stroke='${ink}' stroke-width='8'/><circle cx='200' cy='32' r='13' fill='${g}' stroke='${ink}' stroke-width='6'/>`,
    `<path d='M94 176a106 106 0 0 1 212 0' fill='none' stroke='${ink}' stroke-width='14'/><rect x='74' y='156' width='32' height='60' rx='12' fill='${ink}'/><rect x='294' y='156' width='32' height='60' rx='12' fill='${ink}'/>`,
    `<path d='M152 86l12-40 22 26 14-34 14 34 22-26 12 40z' fill='${g}' stroke='${ink}' stroke-width='6' stroke-linejoin='round'/>`,
    `<ellipse cx='200' cy='56' rx='62' ry='13' fill='none' stroke='${g}' stroke-width='9'/>`,
    `<path d='M124 110l-22-56 50 32zM276 110l22-56-50 32z' fill='${ink}'/>`,
  ][t.accessory];
  const sparkles =
    tier >= 2
      ? `<g fill='#fff' opacity='.85'><path d='M70 70l4 10 10 4-10 4-4 10-4-10-10-4 10-4z'/><path d='M330 220l3 8 8 3-8 3-3 8-3-8-8-3 8-3z'/><path d='M318 64l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'/></g>`
      : "";
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>` +
    `<defs>${material}<radialGradient id='v' cx='.5' cy='.45' r='.6'><stop offset='0' stop-color='#fff' stop-opacity='.35'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient></defs>` +
    `<rect width='400' height='300' fill='${t.background}'/>` +
    `<circle cx='200' cy='172' r='150' fill='url(#v)'/>` +
    `<ellipse cx='200' cy='286' rx='120' ry='16' fill='${ink}' opacity='.18'/>` +
    top +
    `<ellipse cx='200' cy='180' rx='112' ry='104' fill='${t.shell}' stroke='${ink}' stroke-width='8'/>` +
    overlay +
    `<rect x='122' y='124' width='156' height='70' rx='35' fill='${ink}'/>` +
    eyes +
    `<circle cx='200' cy='234' r='14' fill='${ink}'/><path d='M193 240h14l4 22h-22z' fill='${ink}'/>` +
    sparkles +
    `</svg>`
  );
}

export function keeperArt(dna: number, tier: number): string {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(keeperSvg(dna, tier))
  );
}
