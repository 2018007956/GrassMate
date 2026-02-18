import { ExternalLink, Trophy, Medal } from 'lucide-react';

interface LeaderboardRowProps {
  rank: number;
  username: string;
  displayName: string;
  avatar: string;
  change: number;
  additions: number;
  deletions: number;
  isCurrentUser?: boolean;
  onOpenProfile?: () => void;
}

export function LeaderboardRow({
  rank,
  username,
  displayName,
  avatar,
  change,
  additions,
  deletions,
  isCurrentUser,
  onOpenProfile,
}: LeaderboardRowProps) {
  const getMedalIcon = () => {
    if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-zinc-400" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-700" />;
    return null;
  };

  return (
    <div className={`px-4 py-3 hover:bg-green-50/30 dark:hover:bg-green-900/5 transition-colors border-b border-black/5 dark:border-white/5 last:border-0 ${
      isCurrentUser ? 'bg-green-50/50 dark:bg-green-900/10' : ''
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-6 flex items-center justify-center">
          {rank <= 3 ? (
            getMedalIcon()
          ) : (
            <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">
              {rank}
            </span>
          )}
        </div>

        <img
          src={avatar}
          alt={username}
          className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">
              {displayName}
            </span>
            {isCurrentUser && (
              <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                나
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              @{username}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-xl font-semibold text-zinc-900 dark:text-white">
            {change.toLocaleString()}
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-green-600 dark:text-green-400">+{additions}</span>
            <span className="text-red-600 dark:text-red-400">-{deletions}</span>
          </div>
        </div>

        <button
          onClick={onOpenProfile}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="프로필 열기"
        >
          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
        </button>
      </div>
    </div>
  );
}
