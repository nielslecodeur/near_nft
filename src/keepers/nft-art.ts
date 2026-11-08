/**
 * Character art for the NFTs we mint to carry agents (on nft.examples.testnet).
 *
 * Art: public/nft-art/*.webp, imported with scripts/import-nft-art.py from the
 * demo reference the user supplied (low resolution; replace the files under the
 * same names with final artwork, no code changes).
 *
 * On chain, each minted token's `media` is the public URL of its file
 * (ART_PUBLIC_BASE). In the app we load the same file from our own origin so
 * it shows instantly and identically.
 */
export type Collection = "Characters";

export type NftArtEntry = {
  id: string;
  slug: string;
  name: string;
  collection: Collection;
  /** Path served by this app. */
  image: string;
  /** One line shown under the name on cards. */
  description: string;
};

/** Where the files are publicly reachable, used as on-chain `media`. */
export const ART_PUBLIC_BASE =
  import.meta.env.VITE_NFT_ART_BASE ||
  "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";

export const CHARACTERS: NftArtEntry[] = [
  {
    id: "angel",
    slug: "angel",
    name: "Angel",
    collection: "Characters",
    image: "/nft-art/angel.webp",
    description: "Light, feathers and a steady hand with money.",
  },
  {
    id: "galaxy-soldier",
    slug: "galaxy-soldier",
    name: "Galaxy Soldier",
    collection: "Characters",
    image: "/nft-art/galaxy-soldier.webp",
    description: "Guards a budget like a border.",
  },
  {
    id: "space-warrior",
    slug: "space-warrior",
    name: "Space Warrior",
    collection: "Characters",
    image: "/nft-art/space-warrior.webp",
    description: "Fast on the market, never over the cap.",
  },
  {
    id: "galaxy-princess",
    slug: "galaxy-princess",
    name: "Galaxy Princess",
    collection: "Characters",
    image: "/nft-art/galaxy-princess.webp",
    description: "Pays on time, every time.",
  },
  {
    id: "fate",
    slug: "fate",
    name: "Fate",
    collection: "Characters",
    image: "/nft-art/fate.webp",
    description: "Decides what to buy; the contract decides how much.",
  },
];

export const characterBySlug = (slug: string) => CHARACTERS.find((c) => c.slug === slug);

/** On-chain `media` for a character. */
export const characterMedia = (c: NftArtEntry) => `${ART_PUBLIC_BASE}/${c.slug}.webp`;

/**
 * If `media` points at one of our character files (whatever host), returns the
 * entry so the app can serve the same file locally. Otherwise null.
 */
export function characterFromMedia(media: string | null | undefined) {
  const slug = media?.match(/\/nft-art\/([a-z0-9-]+)\.webp(?:\?.*)?$/)?.[1];
  return slug ? (characterBySlug(slug) ?? null) : null;
}
