import { ReactNode } from 'react';

interface MacOSPopoverProps {
  children: ReactNode;
  width?: number;
  height?: number;
}

export function MacOSPopover({ children, width = 360, height = 520 }: MacOSPopoverProps) {
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
