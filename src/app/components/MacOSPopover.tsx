import { ReactNode } from 'react';

interface MacOSPopoverProps {
  children: ReactNode;
  width?: number;
  height?: number;
}

export function MacOSPopover({ children, width = 360, height = 520 }: MacOSPopoverProps) {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    return (
      <div className="h-screen w-screen overflow-hidden rounded-[28px] bg-white ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/10">
        <div className="h-full w-full overflow-hidden rounded-[28px]">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center min-h-screen bg-black/20 p-8">
      <div 
        className="bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {children}
      </div>
    </div>
  );
}
