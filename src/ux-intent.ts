import { useState } from "react";

// Only public UI choices belong here. Keys, mission capabilities and signatures
// remain in the encrypted vault and existing operation journals.
export function usePublicChoice<T extends string = string>(
  key: string,
  fallback: string,
  valid: (value: string) => boolean = () => true,
) {
  const storageKey = "everkeep.ui.v1:" + key;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved && saved.length <= 2000 && valid(saved)
        ? (saved as T)
        : (fallback as T);
    } catch {
      return fallback as T;
    }
  });
  function save(next: T) {
    setValue(next);
    try {
      sessionStorage.setItem(storageKey, next);
    } catch {}
  }
  return [value, save] as const;
}
export function requestWallet() {
  window.dispatchEvent(new Event("everkeep-connect"));
}
