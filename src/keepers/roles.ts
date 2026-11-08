/**
 * Agent roles. Each role is a preset over one of the two primitives the agents
 * contract enforces on chain: buy on a market (Buyer, NEAR) or pay an
 * allowlist (Payer, USDC). The role picks sensible limits and a mission; the
 * contract only ever sees the seat kind and its policy.
 */
import type { LucideIcon } from "lucide-react";
import { BrainCircuit, CalendarClock, Gem, HandCoins, PiggyBank, Plug, ReceiptText, Tag } from "lucide-react";
import type { Kind } from "./agents";

export type RoleId =
  | "collector"
  | "bargain"
  | "subscription"
  | "allowance"
  | "splitter"
  | "payroll"
  | "byo-payer"
  | "byo-buyer";

export type Unit = "minutes" | "hours" | "days" | "weeks";
export const UNIT_SECONDS: Record<Unit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86_400,
  weeks: 604_800,
};

export type Role = {
  id: RoleId;
  kind: Kind;
  name: string;
  tagline: string;
  icon: LucideIcon;
  /**
   * Bring your own AI: no mission in our runner. The key is generated in the
   * browser and handed to the user, whose own agent drives the seat over MCP.
   */
  byo?: boolean;
  /** How many payees the role expects. */
  payees: "none" | "one" | "many";
  payeeLabel?: string;
  defaults: {
    perTx: string;
    perDay: string;
    budget: string;
    maxPrice?: string;
    minTier?: number;
    /** Payer: amount per payee per period (splitter: the total bill). */
    amount?: string;
    every?: number;
    unit?: Unit;
  };
};

export const ROLES: Role[] = [
  {
    id: "collector",
    kind: "Buyer",
    name: "Collector",
    tagline: "Buys the Keepers you want, under your price, while you sleep.",
    icon: Gem,
    payees: "none",
    defaults: { perTx: "1", perDay: "2", budget: "1", maxPrice: "1", minTier: 0 },
  },
  {
    id: "bargain",
    kind: "Buyer",
    name: "Bargain hunter",
    tagline: "Watches the market and grabs the cheapest card, one a day.",
    icon: Tag,
    payees: "none",
    defaults: { perTx: "0.6", perDay: "0.6", budget: "0.6", maxPrice: "0.6", minTier: 0 },
  },
  {
    id: "subscription",
    kind: "Payer",
    name: "Subscriptions",
    tagline: "Pays a service on time, never more than you allowed.",
    icon: CalendarClock,
    payees: "one",
    payeeLabel: "Service account",
    defaults: { perTx: "5", perDay: "5", budget: "15", amount: "5", every: 30, unit: "days" },
  },
  {
    id: "allowance",
    kind: "Payer",
    name: "Allowance",
    tagline: "Pocket money every week, with a hard ceiling.",
    icon: PiggyBank,
    payees: "one",
    payeeLabel: "Who gets it",
    defaults: { perTx: "10", perDay: "10", budget: "40", amount: "10", every: 1, unit: "weeks" },
  },
  {
    id: "splitter",
    kind: "Payer",
    name: "Bill splitter",
    tagline: "Splits a shared bill between friends, in equal shares.",
    icon: ReceiptText,
    payees: "many",
    payeeLabel: "Friends (comma separated)",
    defaults: { perTx: "3", perDay: "9", budget: "9", amount: "9", every: 30, unit: "days" },
  },
  {
    id: "payroll",
    kind: "Payer",
    name: "Payroll & tips",
    tagline: "Pays each contributor the same amount, on schedule.",
    icon: HandCoins,
    payees: "many",
    payeeLabel: "Contributors (comma separated)",
    defaults: { perTx: "2", perDay: "6", budget: "12", amount: "2", every: 1, unit: "weeks" },
  },
];

export const BYO_ROLES: Role[] = [
  {
    id: "byo-payer",
    kind: "Payer",
    name: "Import an agent",
    tagline: "Bring your own AI (Claude Code, Codex, Cursor or any MCP agent) and let it act through this NFT, inside your limits.",
    icon: BrainCircuit,
    byo: true,
    payees: "many",
    payeeLabel: "Accounts your AI may pay (comma separated)",
    defaults: { perTx: "1", perDay: "3", budget: "5" },
  },
  {
    id: "byo-buyer",
    kind: "Buyer",
    name: "Import an agent",
    tagline: "Bring your own AI (Claude Code, Codex, Cursor or any MCP agent) and let it act through this NFT, inside your limits.",
    icon: Plug,
    byo: true,
    payees: "none",
    defaults: { perTx: "0.5", perDay: "1", budget: "1" },
  },
];

export const ALL_ROLES = [...ROLES, ...BYO_ROLES];
/** What the role pickers show: the built-in jobs, then one "Import an agent" card. */
export const PICKER_ROLES = [...ROLES, BYO_ROLES[0]];
export const roleOf = (id?: string) => ALL_ROLES.find((r) => r.id === id);
/** Fallback role for seats created before roles existed. */
export const defaultRole = (kind: Kind) => (kind === "Buyer" ? ROLES[0] : ROLES[2]);
