import { AlertCircle, Key } from 'lucide-react';

interface ErrorStateProps {
  type: 'rate-limit' | 'token-missing';
  onRetry?: () => void;
}

export function ErrorState({ type, onRetry }: ErrorStateProps) {
  const content = {
    'rate-limit': {
      icon: AlertCircle,
      title: 'API 제한 초과',
      description: '잠시 후 다시 시도해주세요.\nGitHub API 호출 한도에 도달했습니다.',
      action: '다시 시도',
    },
    'token-missing': {
      icon: Key,
      title: 'GitHub 연결 필요',
      description: 'GitHub 토큰이 없거나 만료되었습니다.\n설정에서 다시 연결해주세요.',
      action: '설정 열기',
    },
  };

  const { icon: Icon, title, description, action } = content[type];

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      <div className="w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-12 h-12 text-red-600 dark:text-red-400" />
      </div>
      
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">
        {title}
      </h3>
      
      <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-6 whitespace-pre-line">
        {description}
      </p>
      
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg transition-colors"
      >
        {action}
      </button>
    </div>
  );
}
