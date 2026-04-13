import type { ToggleOption } from "@/types/ui";

export function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<ToggleOption<T>>;
}) {
  return (
    <div className="switch-group" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`switch-option ${value === option.value ? "switch-option-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
