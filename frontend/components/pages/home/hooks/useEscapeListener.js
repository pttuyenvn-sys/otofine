const React = require("react");
const { useEffect } = React;

// Calls handler when Escape key is pressed. No-op on server.
function useEscapeListener(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return () => {};
    if (typeof window === "undefined") return () => {};
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        try {
          handler && handler(e);
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handler, enabled]);
}

module.exports = useEscapeListener;

