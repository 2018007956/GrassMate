import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface AutoFitTextProps {
  text: string;
  className?: string;
  maxFontPx?: number;
  minFontPx?: number;
  precisionPx?: number;
  title?: string;
}

export function AutoFitText({
  text,
  className,
  maxFontPx = 14,
  minFontPx = 10,
  precisionPx = 0.5,
  title,
}: AutoFitTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontPx);

  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    const textNode = textRef.current;
    if (!container || !textNode) return;

    textNode.style.fontSize = `${maxFontPx}px`;

    const containerWidth = container.clientWidth;
    const textWidth = textNode.scrollWidth;
    if (containerWidth <= 0 || textWidth <= 0) return;

    const ratio = containerWidth / textWidth;
    const scaled = maxFontPx * ratio;
    const stepped = Math.floor(scaled / precisionPx) * precisionPx;
    const nextSize = Math.max(minFontPx, Math.min(maxFontPx, stepped));
    setFontSize(Number(nextSize.toFixed(2)));
  }, [maxFontPx, minFontPx, precisionPx]);

  useLayoutEffect(() => {
    fitToContainer();
  }, [fitToContainer, text]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      fitToContainer();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fitToContainer]);

  return (
    <div ref={containerRef} className={className} title={title ?? text}>
      <span
        ref={textRef}
        className="block whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
      >
        {text}
      </span>
    </div>
  );
}
