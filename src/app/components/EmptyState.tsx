import { Sprout } from 'lucide-react';

interface EmptyStateProps {
  topAligned?: boolean;
  className?: string;
}

export function EmptyState({ topAligned = false, className = '' }: EmptyStateProps) {
  const layoutClassName = topAligned
    ? 'justify-start pt-6 pb-8'
    : 'h-full justify-center py-12';

  return (
    <div className={`flex flex-col items-center px-8 ${layoutClassName} ${className}`.trim()}>
      <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-full flex items-center justify-center mb-4">
        <Sprout className="w-12 h-12 text-green-600 dark:text-green-400" />
      </div>
      
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
        메이트가 없습니다
      </h3>
    </div>
  );
}
