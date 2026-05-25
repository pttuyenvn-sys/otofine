/**
 * Phase 7.1 — directory page skeleton.
 * Renders during SSR transitions (e.g. clicking a filter chip).
 */
export default function ShopsDirectoryLoading() {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm h-[96px] animate-pulse" />
      <div className="bg-white rounded-2xl shadow-sm h-[160px] animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-7">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl shadow-sm h-[260px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
