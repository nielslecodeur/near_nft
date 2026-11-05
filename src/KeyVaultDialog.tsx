import { useEffect, useRef, useState } from "react";
import { createVault, hasVault, unlockVault, importVault } from "./key-vault";
type Request = {
  owner: string;
  resolve: () => void;
  reject: (e: Error) => void;
};
export function KeyVaultDialog() {
  const [request, setRequest] = useState<Request | null>(null),
    [exists, setExists] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = async (e: Event) => {
      const next = (e as CustomEvent<Request>).detail;
      setExists(await hasVault(next.owner));
      setRequest(next);
      setError("");
      setPassword("");
    };
    window.addEventListener("everkeep-vault-request", open);
    return () => window.removeEventListener("everkeep-vault-request", open);
  }, []);
  useEffect(() => {
    if (request) dialog.current?.showModal();
    else dialog.current?.close();
  }, [request]);
  function cancel() {
    if (busy) return;
    request?.reject(new Error("Ouverture du coffre annulée."));
    setRequest(null);
    setPassword("");
  }
  async function submit() {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      if (exists) await unlockVault(request.owner, password);
      else await createVault(request.owner, password);
      request.resolve();
      setRequest(null);
      setPassword("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="key-vault-dialog"
      aria-labelledby="vault-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="vault-title">
          {exists ? "Déverrouiller votre coffre" : "Protéger votre position"}
        </h2>
        <p>
          {exists
            ? "Votre mot de passe déverrouille les autorisations de position sur cet appareil."
            : "Choisissez un mot de passe Everkeep. Vos clés de position seront enregistrées automatiquement sous forme chiffrée sur cet appareil."}
        </p>
        <label htmlFor="vault-password">Mot de passe Everkeep</label>
        <input
          id="vault-password"
          type="password"
          autoComplete={exists ? "current-password" : "new-password"}
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <p>
          Le wallet signe vos transactions NEAR. Everkeep ne demande jamais sa
          phrase de récupération. La copie de secours du coffre est facultative,
          dans Options.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="action-row">
          <button type="button" disabled={busy} onClick={cancel}>
            Annuler
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy
              ? "Ouverture…"
              : exists
                ? "Déverrouiller"
                : "Créer mon coffre"}
          </button>
        </div>
        {!exists && (
          <details>
            <summary>Restaurer une ancienne sauvegarde</summary>
            <label>
              Fichier chiffré Everkeep
              <input
                type="file"
                accept="application/json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && request)
                    void f
                      .text()
                      .then(JSON.parse)
                      .then((v) => importVault(v, request.owner))
                      .then(() => setExists(true))
                      .catch((e) => setError(String(e)));
                }}
              />
            </label>
          </details>
        )}
      </form>
    </dialog>
  );
}
