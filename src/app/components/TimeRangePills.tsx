interface TimeRangePillsProps {
  selected: string;
  onChange: (value: string) => void;
  options?: string[];
}

export function TimeRangePills({ selected, onChange, options = ['7일', '30일', '90일'] }: TimeRangePillsProps) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            selected === option
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
