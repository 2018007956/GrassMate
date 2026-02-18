interface SegmentedControlProps {
  options: string[];
  selected: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ options, selected, onChange }: SegmentedControlProps) {
  return (
    <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-lg">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            selected === option
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
