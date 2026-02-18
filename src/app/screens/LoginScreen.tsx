import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Github } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

function getRemainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatRemaining(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function LoginScreen() {
  const { state, error, deviceFlowInfo, startLogin, cancelLogin } = useAuth();
  const [remaining, setRemaining] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deviceFlowInfo) {
      setRemaining('');
      setRemainingSeconds(0);
      setTotalSeconds(0);
      setCopied(false);
      return;
    }

    const initialSeconds = getRemainingSeconds(deviceFlowInfo.expiresAt);
    setCopied(false);
    setRemainingSeconds(initialSeconds);
    setTotalSeconds(initialSeconds);
    setRemaining(formatRemaining(initialSeconds));

    const timer = window.setInterval(() => {
      const nextSeconds = getRemainingSeconds(deviceFlowInfo.expiresAt);
      setRemainingSeconds(nextSeconds);
      setRemaining(formatRemaining(nextSeconds));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [deviceFlowInfo]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const isWaiting = state === 'deviceFlow' && Boolean(deviceFlowInfo);

  const progressPercent = useMemo(() => {
    if (!isWaiting || totalSeconds <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100));
  }, [isWaiting, remainingSeconds, totalSeconds]);

  const statusText = useMemo(() => {
    if (state === 'error' && error) return error;
    if (isWaiting) return '승인 대기 중…';
    return '';
  }, [error, isWaiting, state]);

  const copyCode = async () => {
    if (!deviceFlowInfo) return;

    try {
      await navigator.clipboard.writeText(deviceFlowInfo.userCode);
      setCopied(true);
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#f3f4f6_0%,#eef2f5_44%,#e9edf1_100%)] px-5 py-10 text-zinc-900 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-zinc-300/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 right-8 h-56 w-56 rounded-full bg-zinc-200/45 blur-3xl"
      />

      <div className="relative mx-auto mt-2 w-full max-w-lg rounded-3xl border border-black/10 bg-white/95 p-7 shadow-[0_28px_70px_-32px_rgba(0,0,0,0.26)] backdrop-blur-sm sm:mt-8 sm:p-10">
        <h1 className="mt-0">
          <span className="font-brand inline-block text-4xl leading-none font-bold sm:text-5xl">
            <span className="inline-block bg-linear-to-r from-zinc-900 via-zinc-700 to-zinc-500 bg-clip-text text-transparent drop-shadow-[0_10px_20px_rgba(0,0,0,0.18)]">
              GrassMate
            </span>{' '}
            <span className="text-green-500">🌱</span>
          </span>
        </h1>
        <div className="mt-2 h-1 w-24 rounded-full bg-linear-to-r from-green-500 via-green-500 to-emerald-500" />
        <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
          친구들의 잔디 변화를 확인하며, 함께 성장해보세요.
        </p>

        {!isWaiting && (
          <div className="mt-8">
            <button
              className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-green-600 px-5 py-3.5 text-base font-semibold text-white shadow-[0_16px_35px_-16px_rgba(22,163,74,0.72)] transition duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-[0_20px_40px_-16px_rgba(22,163,74,0.88)] active:translate-y-0"
              onClick={() => void startLogin()}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/18">
                <Github className="h-4 w-4" />
              </span>
              GitHub 로그인
            </button>
          </div>
        )}

        {isWaiting && deviceFlowInfo && (
          <div className="mt-8 space-y-4 rounded-2xl border border-black/10 bg-black/[0.02] p-4 animate-in fade-in slide-in-from-bottom-2 sm:p-5">
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-800">1. GitHub 인증 페이지 열기</p>
                <button
                  className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  onClick={() => window.open(deviceFlowInfo.verificationUri, '_blank', 'noopener,noreferrer')}
                >
                  열기
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4 text-center shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-semibold tracking-[0.24em] text-zinc-500">USER CODE</div>
              <div className="mt-2 text-3xl font-black tracking-[0.28em] text-zinc-900">{deviceFlowInfo.userCode}</div>
              <button
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 transition hover:text-green-800"
                onClick={() => void copyCode()}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    코드 복사됨
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    코드 복사
                  </>
                )}
              </button>
            </div>

            <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">2. 코드 입력 후 승인 대기</span>
                <span className="font-semibold text-green-700">{remaining}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                onClick={cancelLogin}
              >
                취소
              </button>
              <button
                className="flex-1 rounded-xl border border-green-700 bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                onClick={() => {
                  cancelLogin();
                  void startLogin();
                }}
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {statusText && (
          <p
            className={`mt-5 text-sm ${
              state === 'error'
                ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700'
                : 'text-zinc-600'
            }`}
          >
            {statusText}
          </p>
        )}
      </div>
    </main>
  );
}
