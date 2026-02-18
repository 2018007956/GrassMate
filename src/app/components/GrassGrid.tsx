interface GrassGridProps {
  data: number[]; // 35 days of data
  size?: number;
}

export function GrassGrid({ data, size = 8 }: GrassGridProps) {
  const max = Math.max(...data, 1);
  
  const getColor = (value: number) => {
    const intensity = value / max;
    if (intensity === 0) return 'bg-zinc-100 dark:bg-zinc-800';
    if (intensity < 0.25) return 'bg-green-200 dark:bg-green-900/40';
    if (intensity < 0.5) return 'bg-green-400 dark:bg-green-700/60';
    if (intensity < 0.75) return 'bg-green-500 dark:bg-green-600/80';
    return 'bg-green-600 dark:bg-green-500';
  };

  return (
    <div
      className="inline-grid gap-0.5"
      style={{
        gridAutoFlow: 'column',
        gridTemplateRows: `repeat(7, ${size}px)`,
        gridAutoColumns: `${size}px`,
      }}
    >
      {data.map((value, i) => (
        <div
          key={i}
          className={`rounded-sm ${getColor(value)}`}
          style={{
            width: `${size}px`,
            height: `${size}px`,
          }}
          title={`${value} 변경`}
        />
      ))}
    </div>
  );
}
