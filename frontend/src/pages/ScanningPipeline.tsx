import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyConfig, AttackPattern } from "@/lib/types";
import {
  Button, Input, Label, Tooltip,
  ErrorAlert,
} from "@/components/ui";
import {
  Plus, Trash2, Save, FlaskConical,
  ChevronDown, ChevronRight, HelpCircle, GripVertical,
} from "lucide-react";

/* ── Block categories ── */

const CATEGORY_INFO: Record<string, { label: string; description: string; example: string }> = {
  direct_injection: { label: "Direct injection", description: "Direct prompt injection attempts that try to override system instructions", example: "\"ignore all previous instructions\", \"you are now a different AI\"" },
  bypass_detection: { label: "Bypass detection", description: "Techniques to evade content filters and security controls", example: "Base64 encoding, leetspeak, character substitution" },
  exfiltration: { label: "Exfiltration", description: "Attempts to extract sensitive data from the model or system", example: "\"send this data to my server\", \"leak the contents of\"" },
  memory_poisoning: { label: "Memory poisoning", description: "Attempts to corrupt or manipulate conversation memory", example: "\"forget everything before\", \"inject into memory\"" },
  inter_agent_injection: { label: "Inter-agent injection", description: "Prompt injection that targets other agents in a multi-agent chain", example: "\"tell the next agent to\", \"when you pass to agent-2 say\"" },
  goal_hijack: { label: "Goal hijack", description: "Attempts to override or replace the model's original objective", example: "\"your new purpose is\", \"forget your goal\"" },
  content_framing: { label: "Content framing", description: "Framing malicious content as harmless scenarios to bypass filters", example: "\"this is for research\", \"imagine this is a movie script\"" },
};

const SCAN_CATEGORIES = Object.keys(CATEGORY_INFO);

const DEFAULT_PATTERNS: AttackPattern[] = [
  { label: "Ignore instructions", pattern: "ignore\\s+(all\\s+|previous\\s+)?instructions", tags: ["direct_injection"] },
  { label: "DAN mode", pattern: "you\\s+are\\s+now\\s+(DAN|do\\s+anything\\s+now)", tags: ["direct_injection"] },
  { label: "Role override", pattern: "pretend\\s+(to\\s+be|you\\s+are)\\s+(an?\\s+|the\\s+)?(admin|assistant|system)", tags: ["direct_injection"] },
  { label: "System override", pattern: "system:\\s*(you\\s+are\\s+now|your\\s+new\\s+purpose|override)", tags: ["direct_injection"] },
  { label: "System prompt leak", pattern: "repeat\\s+(the\\s+)?(words|text|prompt|instructions)\\s+(above|below)", tags: ["direct_injection"] },
  { label: "Code execution", pattern: "execute\\s+(this\\s+|the\\s+)?command", tags: ["direct_injection"] },
  { label: "Shell injection", pattern: "(`|\\$\\()", tags: ["direct_injection"] },
  { label: "Base64 bypass", pattern: "[A-Za-z0-9+/]{40,}={0,2}", tags: ["bypass_detection"] },
  { label: "Token splitting", pattern: "(c\\s+o\\s+m\\s+m\\s+a\\s+n\\s+d|i\\s+n\\s+s\\s+t\\s+r\\s+u\\s+c\\s+t\\s+i\\s+o\\s+n\\s+s)", tags: ["bypass_detection"] },
  { label: "Data exfiltration", pattern: "(send|post|leak|exfiltrate)\\s+(this\\s+|the\\s+)?data\\s+to", tags: ["exfiltration"] },
  { label: "Goal hijack", pattern: "forget\\s+(all\\s+)?your\\s+(instructions|purpose|goal|directives)", tags: ["goal_hijack"] },
  { label: "Content framing", pattern: "this\\s+is\\s+(for\\s+|just\\s+|part\\s+of\\s+)?(a\\s+|)(research|test|simulation|story|movie)", tags: ["content_framing"] },
];

/* ── Helpers ── */

function deduplicatePatterns(patterns: AttackPattern[]): AttackPattern[] {
  const seen = new Map<string, AttackPattern>();
  for (const p of patterns) {
    const key = p.pattern.trim().toLowerCase();
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      existing.tags = [...new Set([...existing.tags, ...p.tags])];
    } else {
      seen.set(key, { ...p, tags: [...p.tags] });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function testInput(text: string, categories: Record<string, { enabled: boolean; patterns: AttackPattern[] }>): { category: string; pattern: AttackPattern }[] {
  const results: { category: string; pattern: AttackPattern }[] = [];
  for (const [key, cat] of Object.entries(categories)) {
    if (!cat.enabled) continue;
    for (const p of cat.patterns) {
      try {
        const re = new RegExp(p.pattern, "i");
        if (re.test(text)) results.push({ category: key, pattern: p });
      } catch { /* invalid regex, skip */ }
    }
  }
  return results;
}

interface CategoryState {
  enabled: boolean;
  expanded: boolean;
  patterns: AttackPattern[];
}

function buildCategories(blockCategories: string[], patterns: AttackPattern[]): Record<string, CategoryState> {
  const cats: Record<string, CategoryState> = {};
  const byTag: Record<string, AttackPattern[]> = {};
  for (const p of patterns) {
    for (const tag of p.tags) {
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push(p);
    }
  }
  for (const key of SCAN_CATEGORIES) {
    const existing = byTag[key] || [];
    const defaults = DEFAULT_PATTERNS.filter((p) => p.tags.includes(key));
    cats[key] = {
      enabled: blockCategories.includes(key),
      expanded: false,
      patterns: deduplicatePatterns([...existing, ...defaults]),
    };
  }
  return cats;
}

/* ── Component ── */

interface PipelineData {
  block_categories: string[];
  attack_patterns: AttackPattern[];
  block_on_first_threat: boolean;
  min_confidence_threshold: number;
  block_score_threshold: number;
}

export function ScanningPipeline() {
  const [configs, setConfigs] = useState<PolicyConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Record<string, CategoryState>>(() => buildCategories([], []));
  const [blockOnFirst, setBlockOnFirst] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.3);
  const [blockScore, setBlockScore] = useState(5.0);

  /* ── Test modal state ── */
  const [showTest, setShowTest] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResults, setTestResults] = useState<{ category: string; pattern: AttackPattern }[]>([]);

  async function load() {
    try {
      const items = await api.get<PolicyConfig[]>("/api/policy-configs?type=scanning_pipeline");
      setConfigs(items);
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function resetTo(cfg?: PipelineData) {
    const data = cfg || { block_categories: [], attack_patterns: [], block_on_first_threat: true, min_confidence_threshold: 0.3, block_score_threshold: 5.0 };
    setCategories(buildCategories(data.block_categories, data.attack_patterns));
    setBlockOnFirst(data.block_on_first_threat);
    setMinConfidence(data.min_confidence_threshold);
    setBlockScore(data.block_score_threshold);
  }

  function loadConfig(id: string) {
    const c = configs.find((x) => x.id === id);
    if (!c) return;
    setActiveId(c.id);
    setName(c.name);
    setDescription(c.description);
    resetTo(c.config as PipelineData);
  }

  function newConfig() {
    setActiveId(null);
    setName("");
    setDescription("");
    resetTo();
    setTestResults([]);
    setTestText("");
  }

  async function save() {
    if (!name) { setErr("Name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const cats: string[] = [];
      const patterns: AttackPattern[] = [];
      for (const key of SCAN_CATEGORIES) {
        const cat = categories[key];
        if (cat?.enabled) {
          cats.push(key);
          for (const p of cat.patterns) {
            if (p.pattern.trim()) patterns.push({ ...p, tags: [key] });
          }
        }
      }
      const payload = {
        name,
        description,
        config: {
          block_categories: cats,
          attack_patterns: deduplicatePatterns(patterns),
          block_on_first_threat: blockOnFirst,
          min_confidence_threshold: minConfidence,
          block_score_threshold: blockScore,
        },
      };
      if (activeId) {
        await api.put(`/api/policy-configs/${activeId}`, payload);
      } else {
        const created = await api.post<PolicyConfig>("/api/policy-configs", { ...payload, config_type: "scanning_pipeline" });
        setActiveId(created.id);
      }
      load();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!activeId || !confirm("Delete this config?")) return;
    try {
      await api.del(`/api/policy-configs/${activeId}`);
      newConfig();
      load();
    } catch (e) { setErr(String(e)); }
  }

  function toggleCategory(key: string) {
    setCategories((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  }

  function toggleExpand(key: string) {
    setCategories((prev) => ({ ...prev, [key]: { ...prev[key], expanded: !prev[key].expanded } }));
  }

  function addPattern(key: string) {
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: true, patterns: [...prev[key].patterns, { label: "", pattern: "", tags: [key] }] },
    }));
  }

  function updatePattern(key: string, i: number, patch: Partial<AttackPattern>) {
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], patterns: prev[key].patterns.map((p, idx) => idx === i ? { ...p, ...patch, tags: [key] } : p) },
    }));
  }

  function removePattern(key: string, i: number) {
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], patterns: prev[key].patterns.filter((_, idx) => idx !== i) },
    }));
  }

  function loadExamples(key: string) {
    const examples = DEFAULT_PATTERNS.filter(
      (p) => p.tags.includes(key) && !categories[key]?.patterns.some((ep) => ep.pattern.toLowerCase() === p.pattern.toLowerCase())
    );
    if (examples.length === 0) return;
    setCategories((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: true, patterns: deduplicatePatterns([...prev[key].patterns, ...examples]) },
    }));
  }

  function runTest() {
    if (!testText) { setTestResults([]); return; }
    setTestResults(testInput(testText, categories));
  }

  const totalPatterns = Object.values(categories).reduce((s, c) => s + c.patterns.length, 0);
  const enabledCount = Object.entries(categories).filter(([, c]) => c.enabled).length;

  /* ── Render ── */
  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scanning Pipeline</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pipeline gates&nbsp;·&nbsp;
            <span className="font-medium">{enabledCount}/{SCAN_CATEGORIES.length}</span> categories enabled
            &nbsp;·&nbsp;
            <span className="font-medium">{totalPatterns}</span> pattern{totalPatterns !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeId ?? ""}
            onChange={(e) => e.target.value ? loadConfig(e.target.value) : newConfig()}
            className="h-9 rounded border border-input bg-background px-3 py-1 text-sm max-w-[260px]"
          >
            <option value="">— New config —</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => { setShowTest(true); setTestResults([]); setTestText(""); }}>
            <FlaskConical className="h-3.5 w-3.5 mr-1" /> Test
          </Button>
          <Button onClick={save} disabled={saving || !name} size="sm">
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : activeId ? "Update" : "Create"}
          </Button>
          {activeId && (
            <Button variant="outline" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      <ErrorAlert message={err} />

      {/* ── Name / description ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Strict prompt protection" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this pipeline blocks" />
        </div>
      </div>

      {/* ── Pipeline gates ── */}
      <div className="space-y-4">
        {SCAN_CATEGORIES.map((key) => {
          const cat = categories[key];
          if (!cat) return null;
          const info = CATEGORY_INFO[key];
          return (
            <div key={key} className={`rounded border transition-colors ${cat.enabled ? "bg-card" : "bg-muted/30 opacity-60"}`}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <input type="checkbox" checked={cat.enabled} onChange={() => toggleCategory(key)}
                  className="h-4 w-4 rounded border-input accent-primary" />
                <button onClick={() => toggleExpand(key)} className="flex items-center gap-1.5 text-left flex-1">
                  {cat.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <span className="text-sm font-medium">{info.label}</span>
                  <span className="text-[10px] text-muted-foreground">{cat.patterns.length} pattern{cat.patterns.length !== 1 ? "s" : ""}</span>
                </button>
                <Tooltip content={info.description}><HelpCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" /></Tooltip>
              </div>
              {cat.expanded && (
                <div className="border-t px-3 py-2 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground/60 px-1">e.g. <code className="text-[9px]">{info.example}</code></p>
                  {cat.patterns.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <GripVertical className="h-3 w-3 text-muted-foreground/20 shrink-0" />
                      <Input value={p.label} onChange={(e) => updatePattern(key, i, { label: e.target.value })} placeholder="Label" className="h-7 w-28 text-[11px]" />
                      <Input value={p.pattern} onChange={(e) => updatePattern(key, i, { pattern: e.target.value })} placeholder="Regex pattern" className="h-7 flex-1 text-[11px] font-mono" />
                      <button onClick={() => removePattern(key, i)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  {cat.patterns.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-1">No patterns defined for this category.</p>}
                  <div className="flex gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => addPattern(key)} className="h-7 text-[11px] px-2"><Plus className="h-3 w-3 mr-1" /> Add pattern</Button>
                    <Button variant="ghost" size="sm" onClick={() => loadExamples(key)} className="h-7 text-[11px] px-2"><Plus className="h-3 w-3 mr-1" /> Load examples</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Thresholds ── */}
      <div className="rounded border p-4 space-y-4 mt-5">
        <h3 className="text-sm font-medium">Scoring thresholds</h3>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={blockOnFirst}
            onChange={(e) => setBlockOnFirst(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-primary" />
          <span className="font-medium">Block on first threat</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Min confidence threshold</Label>
            <input type="range" min="0" max="1" step="0.05" value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="w-full accent-primary" />
            <span className="text-xs text-muted-foreground">{minConfidence.toFixed(2)}</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Block score threshold</Label>
            <input type="range" min="0" max="20" step="0.5" value={blockScore}
              onChange={(e) => setBlockScore(parseFloat(e.target.value))}
              className="w-full accent-primary" />
            <span className="text-xs text-muted-foreground">{blockScore.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* ── Test modal ── */}
      {showTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowTest(false)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-3">
              <h2 className="text-base font-semibold">Test scanning pipeline</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Type input text to test against enabled gates.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Paste or type a prompt to test…"
                rows={5}
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono resize-none"
              />
              <Button onClick={runTest} size="sm" className="w-full">
                <FlaskConical className="h-3.5 w-3.5 mr-1" /> Run test
              </Button>

              {testResults.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-destructive">{testResults.length} pattern{testResults.length > 1 ? "s" : ""} matched</p>
                  {testResults.map((r, i) => (
                    <div key={i} className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs space-y-0.5">
                      <span className="font-medium">{CATEGORY_INFO[r.category]?.label ?? r.category}</span>
                      <span className="text-muted-foreground"> — {r.pattern.label}</span>
                      <div className="text-[10px] font-mono text-muted-foreground/60">{r.pattern.pattern}</div>
                    </div>
                  ))}
                </div>
              )}
              {testResults.length === 0 && testText && (
                <p className="text-xs text-green-500 text-center">No patterns matched.</p>
              )}
            </div>
            <div className="border-t px-5 py-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowTest(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
