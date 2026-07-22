import { useState, useMemo } from "react";
import type { AttackPattern } from "@/lib/types";
import { Button, Input, Label, Tooltip } from "@/components/ui";
import {
  Plus, Trash2, ChevronDown, ChevronRight, HelpCircle,
  AlertTriangle, GripVertical,
} from "lucide-react";

interface CategoryInfo {
  label: string;
  description: string;
  example: string;
}

interface CategoryState {
  enabled: boolean;
  expanded: boolean;
  patterns: AttackPattern[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    block_categories: string[];
    attack_patterns: AttackPattern[];
    min_confidence_threshold: number;
    block_score_threshold: number;
    block_on_first_threat: boolean;
  }) => void;
  initialBlockCategories: string[];
  initialAttackPatterns: AttackPattern[];
  initialMinConfidence: number;
  initialBlockScore: number;
  initialBlockOnFirstThreat: boolean;
  categoryInfo: Record<string, CategoryInfo>;
  categoryKeys: string[];
  examplePatterns: AttackPattern[];
}

function deduplicatePatterns(patterns: AttackPattern[]): AttackPattern[] {
  const seen = new Map<string, AttackPattern>();
  for (const p of patterns) {
    const key = p.pattern.trim().toLowerCase();
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      existing.tags = [...new Set([...existing.tags, ...p.tags])];
    } else {
      seen.set(key, { ...p });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function CategoryPatternsModal({
  open, onClose, onSave,
  initialBlockCategories, initialAttackPatterns,
  initialMinConfidence, initialBlockScore, initialBlockOnFirstThreat,
  categoryInfo, categoryKeys, examplePatterns,
}: Props) {
  const [categories, setCategories] = useState<Record<string, CategoryState>>(() => {
    const cats: Record<string, CategoryState> = {};
    const patternsByTag: Record<string, AttackPattern[]> = {};
    for (const p of initialAttackPatterns) {
      for (const tag of p.tags) {
        if (!patternsByTag[tag]) patternsByTag[tag] = [];
        patternsByTag[tag].push(p);
      }
    }
    for (const key of categoryKeys) {
      const existing = patternsByTag[key] || [];
      const defaults = examplePatterns.filter((p) => p.tags.includes(key));
      cats[key] = {
        enabled: initialBlockCategories.includes(key),
        expanded: false,
        patterns: deduplicatePatterns([...existing, ...defaults]),
      };
    }
    return cats;
  });

  const [uncategorized, setUncategorized] = useState<AttackPattern[]>(() => {
    return initialAttackPatterns.filter(
      (p) => !p.tags.some((t) => categoryKeys.includes(t))
    );
  });

  const [minConfidence, setMinConfidence] = useState(initialMinConfidence);
  const [blockScore, setBlockScore] = useState(initialBlockScore);
  const [blockOnFirst, setBlockOnFirst] = useState(initialBlockOnFirstThreat);

  const allPatternsCount = useMemo(() => {
    let count = uncategorized.length;
    for (const key of categoryKeys) {
      count += categories[key]?.patterns.length ?? 0;
    }
    return count;
  }, [categories, uncategorized, categoryKeys]);

  const duplicates = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const key of categoryKeys) {
      for (const p of categories[key]?.patterns ?? []) {
        const norm = p.pattern.trim().toLowerCase();
        if (!norm) continue;
        if (!seen.has(norm)) seen.set(norm, []);
        const arr = seen.get(norm)!;
        if (!arr.includes(key)) arr.push(key);
      }
    }
    return new Map(
      Array.from(seen.entries()).filter(([, keys]) => keys.length > 1)
    );
  }, [categories, categoryKeys]);

  function toggleCategory(key: string) {
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  }

  function toggleExpand(key: string) {
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }));
  }

  function addPattern(key: string) {
    setCategories((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        expanded: true,
        patterns: [...prev[key].patterns, { label: "", pattern: "", tags: [key] }],
      },
    }));
  }

  function updatePattern(key: string, i: number, patch: Partial<AttackPattern>) {
    setCategories((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        patterns: prev[key].patterns.map((p, idx) =>
          idx === i ? { ...p, ...patch, tags: [key] } : p
        ),
      },
    }));
  }

  function removePattern(key: string, i: number) {
    setCategories((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        patterns: prev[key].patterns.filter((_, idx) => idx !== i),
      },
    }));
  }

  function loadExamples(key: string) {
    const examples = examplePatterns.filter(
      (p) => p.tags.includes(key) && !categories[key].patterns.some(
        (ep) => ep.pattern.toLowerCase() === p.pattern.toLowerCase()
      )
    );
    if (examples.length === 0) return;
    setCategories((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        expanded: true,
        patterns: deduplicatePatterns([...prev[key].patterns, ...examples]),
      },
    }));
  }

  function handleSave() {
    const blockCategories: string[] = [];
    const allPatterns: AttackPattern[] = [];

    for (const key of categoryKeys) {
      const cat = categories[key];
      if (cat.enabled) {
        blockCategories.push(key);
        for (const p of cat.patterns) {
          if (p.pattern.trim()) {
            allPatterns.push({ ...p, tags: [key] });
          }
        }
      }
    }

    for (const p of uncategorized) {
      if (p.pattern.trim()) {
        allPatterns.push(p);
      }
    }

    onSave({
      block_categories: blockCategories,
      attack_patterns: deduplicatePatterns(allPatterns),
      min_confidence_threshold: minConfidence,
      block_score_threshold: blockScore,
      block_on_first_threat: blockOnFirst,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl xl:max-w-5xl flex-col rounded-lg border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Scanning pipeline — block categories</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Enable threat categories, configure their regex patterns, and set scoring thresholds.
            {duplicates.size > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                {duplicates.size} duplicate pattern{duplicates.size > 1 ? "s" : ""} detected
              </span>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {categoryKeys.map((key) => {
            const cat = categories[key];
            if (!cat) return null;
            const info = categoryInfo[key];
            const hasDupe = Array.from(duplicates.values()).some(
              (keys) => keys.includes(key)
            );

            return (
              <div
                key={key}
                className={`rounded border transition-colors ${
                  cat.enabled ? "bg-card" : "bg-muted/30 opacity-60"
                }`}
              >
                {/* Category header row */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={cat.enabled}
                    onChange={() => toggleCategory(key)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <button
                    onClick={() => toggleExpand(key)}
                    className="flex items-center gap-1.5 text-left flex-1"
                  >
                    {cat.expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium">{info.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {cat.patterns.length} pattern{cat.patterns.length !== 1 ? "s" : ""}
                    </span>
                    {hasDupe && (
                      <Tooltip content="Has duplicate patterns across categories">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      </Tooltip>
                    )}
                  </button>
                  <Tooltip content={info.description}>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  </Tooltip>
                </div>

                {/* Expanded pattern editor */}
                {cat.expanded && (
                  <div className="border-t px-3 py-2 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground/60 px-1">
                      e.g. <code className="text-[9px]">{info.example}</code>
                    </p>

                    {cat.patterns.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <GripVertical className="h-3 w-3 text-muted-foreground/20 shrink-0" />
                        <Input
                          value={p.label}
                          onChange={(e) => updatePattern(key, i, { label: e.target.value })}
                          placeholder="Label"
                          className="h-7 w-28 text-[11px]"
                        />
                        <Input
                          value={p.pattern}
                          onChange={(e) => updatePattern(key, i, { pattern: e.target.value })}
                          placeholder="Regex pattern"
                          className="h-7 flex-1 text-[11px] font-mono"
                        />
                        <button
                          onClick={() => removePattern(key, i)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {cat.patterns.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-1">
                        No patterns defined for this category.
                      </p>
                    )}

                    <div className="flex gap-1.5 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addPattern(key)}
                        className="h-7 text-[11px] px-2"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add pattern
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadExamples(key)}
                        className="h-7 text-[11px] px-2"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Load examples
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Global threshold controls */}
          <div className="rounded border p-4 space-y-4">
            <h3 className="text-sm font-medium">Scoring thresholds</h3>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={blockOnFirst}
                onChange={(e) => setBlockOnFirst(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input accent-primary"
              />
              <span className="font-medium">Block on first threat</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Min confidence threshold</Label>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="text-xs text-muted-foreground">{minConfidence.toFixed(2)}</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Block score threshold</Label>
                <input
                  type="range" min="0" max="20" step="0.5"
                  value={blockScore}
                  onChange={(e) => setBlockScore(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="text-xs text-muted-foreground">{blockScore.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>
              {categoryKeys.filter((k) => categories[k]?.enabled).length} / {categoryKeys.length} categories enabled
            </span>
            <span>{allPatternsCount} total patterns</span>
            {duplicates.size > 0 && (
              <span className="text-amber-500">
                {duplicates.size} duplicate{duplicates.size > 1 ? "s" : ""} (same regex in multiple categories)
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
