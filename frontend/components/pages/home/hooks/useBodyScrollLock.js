const React = require("react");
const { useEffect } = React;

// Locks body scroll when `locked` is true by setting overflow hidden.
// Restores previous overflow on cleanup. No-op on server.
function useBodyScrollLock(locked) {
  useEffect(() => {
    if (typeof document === "undefined") return () => {};
    const prev = document.body.style.overflow;
    if (locked) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      try {
        document.body.style.overflow = prev || "";
      } catch {
        // ignore
      }
    };
  }, [locked]);
}

module.exports = useBodyScrollLock;

