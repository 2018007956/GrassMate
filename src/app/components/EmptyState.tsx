import { Sprout } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 rounded-full flex items-center justify-center mb-4">
        <Sprout className="w-12 h-12 text-green-600 dark:text-green-400" />
      </div>
      
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
        메이트가 없습니다
      </h3>
    </div>
  );
}
