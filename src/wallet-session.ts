/** Intear's app-authentication key requests approvals; it is not a NEAR account access key.
 * Keep even this limited secret in memory. Public account/selector preferences can persist. */
const stateKey = Symbol.for("everkeep.wallet-memory-session");
type State = { installed: boolean; values: Map<string, string> };
const host = globalThis as typeof globalThis & { [stateKey]?: State };
const state =
  host[stateKey] || (host[stateKey] = { installed: false, values: new Map() });
const secretKey = "intear-wallet:appPrivateKey";
export function installWalletSessionStorage() {
  if (state.installed) return;
  state.installed = true;
  const prototype = Storage.prototype,
    get = prototype.getItem,
    set = prototype.setItem,
    remove = prototype.removeItem,
    legacy = get.call(localStorage, secretKey);
  if (legacy) {
    state.values.set(secretKey, legacy);
    remove.call(localStorage, secretKey);
  }
  prototype.getItem = function (key: string) {
    return this === localStorage && key === secretKey
      ? state.values.get(key) || null
      : get.call(this, key);
  };
  prototype.setItem = function (key: string, value: string) {
    if (this === localStorage && key === secretKey) {
      state.values.set(key, String(value));
      return;
    }
    set.call(this, key, value);
  };
  prototype.removeItem = function (key: string) {
    if (this === localStorage && key === secretKey) {
      state.values.delete(key);
      return;
    }
    remove.call(this, key);
  };
}
export function hasWalletApprovalSession() {
  return state.values.has(secretKey);
}
