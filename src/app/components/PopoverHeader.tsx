import { RefreshCw, Settings } from 'lucide-react';

interface PopoverHeaderProps {
  onRefresh?: () => void;
  onSettings?: () => void;
  isRefreshing?: boolean;
  subtitle?: string;
}

export function PopoverHeader({ onRefresh, onSettings, isRefreshing, subtitle }: PopoverHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-black/5 dark:border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-md flex items-center justify-center text-white text-xs">
            🌱
          </div>
          <div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              GrassMate 🌱
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="새로고침"
          >
            <RefreshCw 
              className={`w-4 h-4 text-zinc-600 dark:text-zinc-400 ${isRefreshing ? 'animate-spin' : ''}`} 
            />
          </button>
          <button
            onClick={onSettings}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="설정"
          >
            <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>
      </div>
      
      <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        {subtitle ?? '오늘도 잔디 한 칸 🌱'}
      </div>
    </div>
  );
}
