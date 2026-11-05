import { useState } from "react";
import { requestVault, backupVault, importVault } from "./key-vault";
export function VaultSettings({
  owner,
  working,
}: {
  owner: string;
  working: boolean;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <details className="vault-settings">
      <summary>Coffre et sauvegarde</summary>
      <p>
        Vos clés de position sont chiffrées sur cet appareil avec votre mot de
        passe Everkeep. Une copie externe est facultative et utile pour changer
        d’appareil.
      </p>
      <button
        disabled={!owner || working}
        onClick={() => {
          setError("");
          void requestVault(owner)
            .then(() => backupVault(owner))
            .catch((e) => setError(String(e)));
        }}
      >
        Exporter une copie de secours
      </button>
      <details>
        <summary>Restaurer une copie existante</summary>
        <label>
          Fichier chiffré Everkeep
          <input
            type="file"
            accept="application/json"
            disabled={!owner || working}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setError("");
                setNotice("");
                void f
                  .text()
                  .then(JSON.parse)
                  .then((v) => importVault(v, owner))
                  .then(() =>
                    setNotice(
                      "Copie chiffrée importée. Son mot de passe sera demandé pour signer.",
                    ),
                  )
                  .catch((e) => setError(String(e)));
              }
            }}
          />
        </label>
      </details>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
