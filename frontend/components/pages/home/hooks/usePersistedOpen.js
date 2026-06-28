import { useEffect } from "react";

// Keeps a boolean state in sync with sessionStorage key.
// - on mount: if sessionStorage[key] === "1" -> setOpen(true)
// - when open becomes true, write "1"; when false -> remove key
export default function usePersistedOpen(key, open, setOpen) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = sessionStorage.getItem(key);
      if (v === "1") setOpen(true);
    } catch {
      // ignore
    }
    // no cleanup
  }, [key, setOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (open) sessionStorage.setItem(key, "1");
      else sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key, open]);
}

