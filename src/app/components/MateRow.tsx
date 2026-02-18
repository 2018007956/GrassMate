import { ExternalLink, Pin, PinOff, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { useState } from 'react';

interface MateRowProps {
  username: string;
  displayName: string;
  avatar: string;
  additions: number;
  deletions: number;
  change: number;
  trend?: number;
  sparklineData: number[];
  lastUpdated: string;
  isPinned?: boolean;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onOpenProfile?: () => void;
}

export function MateRow({
  username,
  displayName,
  avatar,
  additions,
  deletions,
  change,
  trend = 0,
  sparklineData,
  lastUpdated,
  isPinned = false,
  onDelete,
  onTogglePin,
  onOpenProfile,
}: MateRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isPositive = trend >= 0;

  return (
    <div
      className="group px-4 py-3 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors border-b border-black/5 dark:border-white/5 last:border-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3">
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
            {isPinned && (
              <span
                className="w-4 h-4 inline-flex items-center justify-center text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded"
                aria-label="고정됨"
                title="고정됨"
              >
                <Pin className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            @{username}
          </div>
        </div>

        {isHovered ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onTogglePin}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                isPinned
                  ? 'text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              aria-label={isPinned ? '고정 해제' : '고정'}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onOpenProfile}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="프로필 열기"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              aria-label="삭제"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 dark:text-green-400 font-medium">+{additions}</span>
              <span className="text-red-600 dark:text-red-400">-{deletions}</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <Sparkline 
          data={sparklineData} 
          width={200} 
          height={16}
          className="text-green-500 dark:text-green-400"
        />
        <div className="flex flex-col items-end">
          <div
            className={`flex items-center gap-1 text-[11px] font-medium ${
              isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {lastUpdated}
          </div>
        </div>
      </div>
    </div>
  );
}
