import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/types";

interface Props {
  value: number;
  onChange: (v: number) => void;
  capabilities: Capability[];
  className?: string;
}

export function BitmaskEditor({ value, onChange, capabilities, className }: Props) {
  const labelFor = (bit: number) =>
    capabilities.find((c) => c.bit_position === bit)?.name ?? `bit_${bit}`;

  const toggle = (bit: number, checked: boolean) => {
    const mask = 1 << bit;
    onChange(checked ? value | mask : value & ~mask);
  };

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {Array.from({ length: 64 }, (_, bit) => {
        const checked = (value & (1 << bit)) !== 0;
        return (
          <label
            key={bit}
            className={cn(
              "flex items-center gap-2 rounded border px-2 py-1.5 text-xs",
              checked ? "border-primary bg-accent" : "border-border"
            )}
          >
            <Checkbox checked={checked} onChange={(e) => toggle(bit, e.target.checked)} />
            <span className="truncate">
              <span className="text-muted-foreground">{bit}</span>{" "}
              <span className="font-mono">{labelFor(bit)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function MaskDisplay({
  value,
  capabilities,
}: {
  value: number;
  capabilities: Capability[];
}) {
  const bits = Array.from({ length: 64 }, (_, b) => b).filter((b) => (value & (1 << b)) !== 0);
  if (!bits.length) return <Label className="text-muted-foreground">no capabilities</Label>;
  return (
    <div className="flex flex-wrap gap-1">
      {bits.map((b) => (
        <span
          key={b}
          className="inline-flex items-center rounded bg-accent px-1.5 py-0.5 text-xs font-mono"
        >
          {b}:{capabilities.find((c) => c.bit_position === b)?.name ?? "?"}
        </span>
      ))}
    </div>
  );
}
