import { X } from 'lucide-react';
import { useState } from 'react';

interface AddMateResult {
  ok: boolean;
  message?: string;
}

interface AddMateModalProps {
  onClose: () => void;
  onAdd?: (
    username: string,
    nickname: string,
    isPrivate: boolean,
  ) => Promise<AddMateResult | void> | AddMateResult | void;
}

export function AddMateModal({ onClose, onAdd }: AddMateModalProps) {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError('GitHub 아이디를 입력하세요');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await onAdd?.(username.trim(), nickname.trim(), isPrivate);

      if (result && typeof result === 'object' && result.ok === false) {
        setError(result.message ?? '메이트를 추가하지 못했어요.');
        return;
      }

      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '메이트를 추가하지 못했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-2xl w-80 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            메이트 추가
          </span>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              GitHub 아이디
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              placeholder="예: octocat"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 text-zinc-900 dark:text-white placeholder:text-zinc-400"
            />
            {error && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              별명 (선택)
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="별명(선택)"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 text-zinc-900 dark:text-white placeholder:text-zinc-400"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 rounded border-black/20 dark:border-white/20 text-green-600 focus:ring-2 focus:ring-green-500"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              내 순위에만 표시(비공개)
            </span>
          </label>
        </div>

        <div className="flex gap-2 px-4 py-3 bg-black/2 dark:bg-white/2 border-t border-black/5 dark:border-white/5">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-500 dark:hover:bg-green-600 rounded-lg transition-colors"
          >
            {isSubmitting ? '추가 중…' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
