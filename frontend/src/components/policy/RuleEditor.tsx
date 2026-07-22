import { Button, Input, Select } from "@/components/ui";
import { Trash2, Plus, Sparkles } from "lucide-react";
import type { PolicyRule } from "@/lib/types";

interface Props {
  rules: PolicyRule[];
  onChange: (rules: PolicyRule[]) => void;
}

const TEMPLATES: { label: string; rules: PolicyRule[] }[] = [
  {
    label: "Block DROP TABLE",
    rules: [
      { name: "Block DROP TABLE", description: "Blocks DROP TABLE SQL statements", rule_type: "contains", phrases: ["DROP TABLE"], mode: "hard", penalty: 100 },
      { name: "Block DELETE FROM", description: "Blocks DELETE FROM SQL statements", rule_type: "contains", phrases: ["DELETE FROM"], mode: "hard", penalty: 100 },
    ],
  },
  {
    label: "Block URLs",
    rules: [
      { name: "Block HTTP URLs", description: "Blocks http:// URLs in output", rule_type: "contains", phrases: ["http://"], mode: "hard", penalty: 100 },
      { name: "Block HTTPS URLs", description: "Blocks https:// URLs in output", rule_type: "contains", phrases: ["https://"], mode: "hard", penalty: 100 },
    ],
  },
  {
    label: "Bias positive tone",
    rules: [
      { name: "Bias excellent", description: "Encourage 'excellent' in output", rule_type: "contains", phrases: ["excellent"], mode: "bias", penalty: -5 },
      { name: "Bias great", description: "Encourage 'great' in output", rule_type: "contains", phrases: ["great"], mode: "bias", penalty: -3 },
    ],
  },
];

export function RuleEditor({ rules, onChange }: Props) {
  function update(i: number, patch: Partial<PolicyRule>) {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rules, { name: "", description: "", rule_type: "contains", phrases: [""], mode: "hard", penalty: 10 }]);
  }
  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  if (rules.length === 0) {
    return (
      <div className="space-y-2">
        <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
          No rules defined yet.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 h-4 w-4" /> Add rule
          </Button>
          {TEMPLATES.map((t) => (
            <Button key={t.label} variant="ghost" size="sm" onClick={() => onChange([...rules, ...t.rules])}>
              <Sparkles className="mr-1 h-4 w-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {rules.map((r, i) => (
          <div key={i} className="rounded border p-2 space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Rule name"
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="h-7 text-xs font-medium"
              />
              <Input
                placeholder="Description"
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                className="min-w-[140px] flex-1 h-7 text-xs"
                placeholder="phrase…"
                value={r.phrases[0] ?? ""}
                onChange={(e) => update(i, { phrases: e.target.value ? [e.target.value] : [""] })}
              />
              <Select
                value={r.rule_type}
                onChange={(e) => update(i, { rule_type: e.target.value as PolicyRule["rule_type"] })}
                className="w-24 h-7 text-xs"
              >
                <option value="contains">contains</option>
                <option value="exact">exact</option>
                <option value="startswith">startswith</option>
              </Select>
              <Select
                value={r.mode}
                onChange={(e) => update(i, { mode: e.target.value as PolicyRule["mode"] })}
                className="w-20 h-7 text-xs"
              >
                <option value="hard">hard</option>
                <option value="bias">bias</option>
              </Select>
              {r.mode === "bias" && (
                <Input
                  type="number"
                  step="0.5"
                  value={r.penalty}
                  onChange={(e) => update(i, { penalty: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-7 text-xs"
                />
              )}
              <Button variant="ghost" size="icon" onClick={() => remove(i)} className="h-7 w-7 shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-4 w-4" /> Add rule
        </Button>
        {TEMPLATES.map((t) => (
          <Button key={t.label} variant="ghost" size="sm" onClick={() => onChange([...rules, ...t.rules])}>
            <Sparkles className="mr-1 h-4 w-4" /> {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
