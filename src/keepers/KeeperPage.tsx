import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  ExternalLink,
  Send,
  ShoppingCart,
  Tag,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { Button, Input, Notice, Skeleton } from "../terminal/primitives";
import { KeeperFrame, TierBadge, shortAccount } from "./KeeperCard";
import { ACCESSORIES, TIER_LABELS, VISORS, traits } from "./art";
import * as chain from "./chain";
import {
  EXPLORER,
  KEEPERS_CONTRACT,
  formatNear,
  parseNear,
  type Card,
  type ChainToken,
  type KeepersConfig,
} from "./chain";
import type { Wallet } from "./KeepersApp";

const since = (ns: string) => {
  const ms = Number(BigInt(ns) / 1_000_000n);
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  const date = new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return days <= 0
    ? `${date} (today)`
    : `${date} (${days} day${days > 1 ? "s" : ""})`;
};

function tierProgress(card: Card, config: KeepersConfig) {
  if (!card.next_tier_at) return 1;
  const next = BigInt(card.next_tier_at);
  const prev =
    card.tier === 0 ? 0n : BigInt(config.tier_thresholds[card.tier - 1]);
  const balance = BigInt(card.balance);
  return Number(((balance - prev) * 1000n) / (next - prev)) / 1000;
}

type Done = { title: string; hash?: string };

export function KeeperPage({
  id,
  wallet,
  navigate,
}: {
  id: string;
  wallet: Wallet;
  navigate: (to: string) => void;
}) {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [token, setToken] = useState<ChainToken | null>(null);
  const [config, setConfig] = useState<KeepersConfig | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, t, cfg] = await Promise.all([
        chain.getCard(id),
        chain.getToken(id),
        chain.getConfig(),
      ]);
      setCard(c);
      setToken(t);
      setConfig(cfg);
    } catch (e) {
      setError(`Could not read the contract: ${String(e)}`);
    }
  }, [id]);
  useEffect(() => {
    setCard(undefined);
    setDone(null);
    setError("");
    void load();
  }, [load]);

  /** Runs a signed action, then re-reads the card from chain. */
  async function run(
    name: string,
    title: string,
    action: () => Promise<{ transaction: { hash: string } } | unknown>,
  ) {
    setBusy(name);
    setError("");
    setDone(null);
    try {
      if (!wallet.account) await wallet.connect();
      const result = (await action()) as
        { transaction?: { hash: string } } | undefined;
      setDone({ title, hash: result?.transaction?.hash });
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  }

  if (card === undefined && !error)
    return <Skeleton label={`Reading Keeper #${id} from chain`} />;
  if (!card || !config)
    return (
      <div className="kp-missing">
        {error ? (
          <Notice tone="error" title="Something went wrong">
            {error}
          </Notice>
        ) : (
          <p>Keeper #{id} does not exist yet.</p>
        )}
        <Button icon={ArrowLeft} onClick={() => navigate("/keepers")}>
          Back to the collection
        </Button>
      </div>
    );

  const isOwner = wallet.account !== "" && wallet.account === card.owner_id;
  const progress = tierProgress(card, config);
  const t = traits(card.dna >>> 0);

  return (
    <div className="kp-detail">
      <a
        className="kp-back"
        href="/keepers"
        onClick={(e) => {
          e.preventDefault();
          navigate("/keepers");
        }}
      >
        <ArrowLeft aria-hidden="true" /> Collection
      </a>
      <div className="kp-detail-grid">
        <div className="kp-detail-art">
          <KeeperFrame card={card} />
          <dl className="kp-traits" aria-label="Traits from on-chain DNA">
            <div>
              <dt>Visor</dt>
              <dd>{VISORS[t.visor]}</dd>
            </div>
            <div>
              <dt>Accessory</dt>
              <dd>{ACCESSORIES[t.accessory]}</dd>
            </div>
            <div>
              <dt>DNA</dt>
              <dd className="kp-num">
                {(card.dna >>> 0).toString(16).padStart(8, "0")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="kp-detail-info">
          <div className="kp-title-row">
            <h1>Keeper #{card.token_id}</h1>
            <TierBadge card={card} />
          </div>
          <p className="kp-owner-line">
            Owned by{" "}
            <a
              href={`${EXPLORER}/address/${card.owner_id}`}
              target="_blank"
              rel="noreferrer"
            >
              {isOwner ? "you" : shortAccount(card.owner_id)}
            </a>
            {" · held since "}
            {since(card.held_since)}
          </p>

          <section
            className="kp-balance"
            aria-label="Balance held by this Keeper"
          >
            <span>This card holds</span>
            <strong className="kp-num">{formatNear(card.balance)} NEAR</strong>
            <div
              className="kp-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Progress to the next tier"
            >
              <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <small>
              {card.next_tier_at
                ? `${formatNear(BigInt(card.next_tier_at) - BigInt(card.balance))} NEAR more to reach ${TIER_LABELS[card.tier + 1]}`
                : "Top tier reached"}
            </small>
          </section>

          <dl className="kp-history" aria-label="Lifetime history">
            <div>
              <dt>Royalties earned</dt>
              <dd className="kp-num">{formatNear(card.royalties_earned)}</dd>
            </div>
            <div>
              <dt>Deposited</dt>
              <dd className="kp-num">{formatNear(card.deposited_total)}</dd>
            </div>
            <div>
              <dt>Withdrawn</dt>
              <dd className="kp-num">{formatNear(card.withdrawn_total)}</dd>
            </div>
            <div>
              <dt>Trades</dt>
              <dd className="kp-num">{card.trades}</dd>
            </div>
          </dl>

          {error && (
            <Notice tone="error" title="Transaction not completed">
              {error}
            </Notice>
          )}
          {done && (
            <Notice tone="success" title={done.title}>
              Read back from chain.{" "}
              {done.hash && (
                <a
                  href={`${EXPLORER}/txns/${done.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction{" "}
                  <ExternalLink aria-hidden="true" className="kp-inline-icon" />
                </a>
              )}
            </Notice>
          )}

          {card.list_price && (
            <div className="kp-listing">
              <Tag aria-hidden="true" />
              <span>
                For sale at{" "}
                <strong className="kp-num">
                  {formatNear(card.list_price)} NEAR
                </strong>
                .{" "}
                {formatNear(
                  (BigInt(card.list_price) * BigInt(config.royalty_bps)) /
                    10_000n,
                )}{" "}
                NEAR of it goes into the card.
              </span>
            </div>
          )}

          {isOwner ? (
            <OwnerActions card={card} config={config} busy={busy} run={run} />
          ) : (
            <VisitorActions card={card} wallet={wallet} busy={busy} run={run} />
          )}

          <details className="kp-proof">
            <summary>On-chain proof</summary>
            <div className="kp-proof-body">
              {token?.metadata.media && (
                <img
                  src={token.metadata.media}
                  alt="NFT image returned by nft_token on chain"
                  width={96}
                  height={96}
                />
              )}
              <div>
                <p>
                  Every number on this page comes from view calls on{" "}
                  <a
                    href={`${EXPLORER}/address/${KEEPERS_CONTRACT}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {KEEPERS_CONTRACT}
                  </a>
                  : <code>card</code>, <code>nft_token</code> and{" "}
                  <code>config</code>. The image on the left is the NEP-177
                  media generated by the contract; wallets show it with the live
                  tier.
                </p>
                <p className="kp-num">
                  {token?.metadata.title} · tier {card.tier} ({card.tier_name})
                </p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

type Run = (
  name: string,
  title: string,
  action: () => Promise<unknown>,
) => Promise<void>;

function ActionForm({
  title,
  children,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      className="kp-action"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h3>{title}</h3>
      <div className="kp-action-row">{children}</div>
    </form>
  );
}

function OwnerActions({
  card,
  config,
  busy,
  run,
}: {
  card: Card;
  config: KeepersConfig;
  busy: string;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [receiver, setReceiver] = useState("");
  const amountYocto = amount.trim() === "" ? null : parseNear(amount);
  const priceYocto = parseNear(price);
  const listed = card.list_price !== null;
  return (
    <section className="kp-actions" aria-label="Owner actions">
      <ActionForm
        title="Withdraw from the card"
        onSubmit={() =>
          run("withdraw", "Withdrawn to your wallet", () =>
            chain.withdraw(card.token_id, amountYocto),
          )
        }
      >
        <Input
          label="Amount in NEAR"
          hint={
            listed
              ? "Delist the card first: a listed card cannot be emptied."
              : "Leave empty to withdraw everything."
          }
          inputMode="decimal"
          placeholder={formatNear(card.balance)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={
            amount.trim() !== "" && amountYocto === null
              ? "Enter a number, e.g. 0.5"
              : undefined
          }
        />
        <Button
          type="submit"
          variant="primary"
          icon={WalletIcon}
          busy={busy === "withdraw"}
          disabled={
            listed ||
            card.balance === "0" ||
            (amount.trim() !== "" && amountYocto === null) ||
            busy !== ""
          }
        >
          Withdraw
        </Button>
      </ActionForm>

      {listed ? (
        <ActionForm
          title="Listing"
          onSubmit={() =>
            run("delist", "Listing removed", () => chain.delist(card.token_id))
          }
        >
          <p className="kp-action-note">
            The card is for sale at {formatNear(card.list_price!)} NEAR.
          </p>
          <Button
            type="submit"
            icon={X}
            busy={busy === "delist"}
            disabled={busy !== ""}
          >
            Delist
          </Button>
        </ActionForm>
      ) : (
        <ActionForm
          title="Sell on the built-in market"
          onSubmit={() =>
            priceYocto &&
            run("list", "Listed for sale", () =>
              chain.list(card.token_id, priceYocto),
            )
          }
        >
          <Input
            label="Price in NEAR"
            hint={`Minimum ${formatNear(config.min_list_price)} NEAR. ${config.royalty_bps / 100}% of the price will be credited to the card.`}
            inputMode="decimal"
            placeholder="5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={
              price !== "" && priceYocto === null
                ? "Enter a number, e.g. 5"
                : undefined
            }
          />
          <Button
            type="submit"
            icon={Tag}
            busy={busy === "list"}
            disabled={
              !priceYocto ||
              priceYocto < BigInt(config.min_list_price) ||
              busy !== ""
            }
          >
            List
          </Button>
        </ActionForm>
      )}

      <DepositForm card={card} busy={busy} run={run} />

      <ActionForm
        title="Transfer (NEP-171)"
        onSubmit={() =>
          run("transfer", "Transferred", () =>
            chain.transfer(card.token_id, receiver.trim()),
          )
        }
      >
        <Input
          label="Receiver account"
          hint="The balance, tier and access go with the card."
          placeholder="friend.testnet"
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
        />
        <Button
          type="submit"
          icon={Send}
          busy={busy === "transfer"}
          disabled={
            !/^[a-z0-9._-]+\.(testnet|near)$|^[0-9a-f]{64}$/.test(
              receiver.trim(),
            ) || busy !== ""
          }
        >
          Transfer
        </Button>
      </ActionForm>
    </section>
  );
}

function DepositForm({
  card,
  busy,
  run,
}: {
  card: Card;
  busy: string;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const amountYocto = parseNear(amount);
  return (
    <ActionForm
      title="Top up this card"
      onSubmit={() =>
        amountYocto &&
        run("deposit", "Deposited into the card", () =>
          chain.deposit(card.token_id, amountYocto),
        )
      }
    >
      <Input
        label="Amount in NEAR"
        hint="Anyone can add NEAR. Only the owner can withdraw it."
        inputMode="decimal"
        placeholder="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={
          amount !== "" && amountYocto === null
            ? "Enter a number, e.g. 1"
            : undefined
        }
      />
      <Button
        type="submit"
        icon={Coins}
        busy={busy === "deposit"}
        disabled={!amountYocto || busy !== ""}
      >
        Deposit
      </Button>
    </ActionForm>
  );
}

function VisitorActions({
  card,
  wallet,
  busy,
  run,
}: {
  card: Card;
  wallet: Wallet;
  busy: string;
  run: Run;
}) {
  return (
    <section className="kp-actions" aria-label="Actions">
      {card.list_price && (
        <ActionForm
          title="Buy this Keeper"
          onSubmit={() =>
            run("buy", "You own this Keeper now", () =>
              chain.buy(card.token_id, card.list_price!, card.balance),
            )
          }
        >
          <p className="kp-action-note">
            You pay {formatNear(card.list_price)} NEAR and receive the card with
            the {formatNear(card.balance)} NEAR it holds. If the balance drops
            before your transaction lands, the purchase is refused.
          </p>
          <Button
            type="submit"
            variant="primary"
            icon={ShoppingCart}
            busy={busy === "buy"}
            disabled={busy !== ""}
          >
            {wallet.account
              ? `Buy for ${formatNear(card.list_price)} NEAR`
              : "Connect and buy"}
          </Button>
        </ActionForm>
      )}
      <DepositForm card={card} busy={busy} run={run} />
      <a
        className="kp-explorer-link"
        href={`${EXPLORER}/address/${card.owner_id}`}
        target="_blank"
        rel="noreferrer"
      >
        Owner on explorer <ArrowUpRight aria-hidden="true" />
      </a>
    </section>
  );
}
