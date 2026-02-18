export function LoadingState() {
  return (
    <div className="p-4 space-y-4">
      <div className="text-center py-8">
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          집계 중… 잠시 후 자동으로 업데이트돼요.
        </p>
      </div>

      {/* Skeleton rows */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-9 h-9 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-32" />
            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-24" />
          </div>
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-16" />
        </div>
      ))}
    </div>
  );
}
