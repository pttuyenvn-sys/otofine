const React = require("react");
const { useEffect } = React;

// Adds a resize listener that calls callback({ width, height }) on changes.
// If useMatchMedia is provided, it will also call callback with matches.
function useViewportListener(callback, { useMatchMedia = false, query = "(max-width: 768px)" } = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return () => {};
    const onResize = () => {
      try {
        callback && callback({ width: window.innerWidth, height: window.innerHeight });
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", onResize);
    let mql;
    const onMedia = (e) => {
      try {
        callback && callback({ matches: e.matches });
      } catch {}
    };
    if (useMatchMedia && window.matchMedia) {
      mql = window.matchMedia(query);
      mql.addEventListener ? mql.addEventListener("change", onMedia) : mql.addListener(onMedia);
    }
    // initial call
    onResize();
    if (mql) {
      onMedia(mql);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (mql) {
        mql.removeEventListener ? mql.removeEventListener("change", onMedia) : mql.removeListener(onMedia);
      }
    };
  }, [callback, useMatchMedia, query]);
}

module.exports = useViewportListener;

