import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Policy, MemoryInjectionRule, ContextStrategy } from "@/lib/types";
import {
  Button, Input, Label, Badge, Card, CardContent, CardHeader, CardTitle, ErrorAlert, Tooltip,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui";
import {
  Plus, Trash2, Pencil, Brain, RefreshCw, HelpCircle,
  Save, Play, ChevronRight, Settings2, X,
} from "lucide-react";

const FIELD_OPTIONS = [
  { value: "custom", label: "Custom instruction" },
  { value: "date", label: "Current date" },
  { value: "user_profile", label: "User profile" },
  { value: "session_summary", label: "Session summary" },
];

const INJECT_OPTIONS = [
  { value: "always", label: "Every turn" },
  { value: "first_only", label: "First turn only" },
  { value: "every_n", label: "Every N turns" },
  { value: "never", label: "Never (manual)" },
];

const STRATEGY_OPTIONS = [
  { value: "truncate", label: "Truncate", desc: "Drop oldest turns when context is full" },
  { value: "summarize", label: "Summarize", desc: "Compress old turns into a summary" },
  { value: "fail", label: "Fail", desc: "Block requests when context is full" },
  { value: "roll_window", label: "Roll Window", desc: "Keep a sliding window of recent turns" },
];

export function MemoryPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [rules, setRules] = useState<MemoryInjectionRule[]>([]);
  const [contextStrategy, setContextStrategy] = useState<ContextStrategy>({
    max_tokens: 4000, strategy: "truncate",
    system_budget: 500, memory_budget: 1000, turns_budget: 2500,
  });
  const [sessionId, setSessionId] = useState("");
  const [previewResult, setPreviewResult] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRuleIdx, setEditingRuleIdx] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState<MemoryInjectionRule>({
    field: "custom", content: "", inject_at: "always", priority: 0,
  });

  useEffect(() => {
    api.get<Policy[]>("/api/policies")
      .then(setPolicies).catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedPolicyId) { setRules([]); return; }
    const pol = policies.find((p) => p.id === selectedPolicyId);
    setRules(pol?.memory_injection_rules ?? []);
    if (pol?.context_strategy) setContextStrategy(pol.context_strategy);
  }, [selectedPolicyId, policies]);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  const totalBudget = contextStrategy.max_tokens;
  const usedBudget = (contextStrategy.system_budget ?? 0)
    + (contextStrategy.memory_budget ?? 0)
    + (contextStrategy.turns_budget ?? 0);
  const freeBudget = totalBudget - usedBudget;
  const systemPct = totalBudget > 0 ? ((contextStrategy.system_budget ?? 0) / totalBudget) * 100 : 0;
  const memoryPct = totalBudget > 0 ? ((contextStrategy.memory_budget ?? 0) / totalBudget) * 100 : 0;
  const turnsPct = totalBudget > 0 ? ((contextStrategy.turns_budget ?? 0) / totalBudget) * 100 : 0;
  const freePct = totalBudget > 0 ? (freeBudget / totalBudget) * 100 : 100;

  const savePolicy = async () => {
    if (!selectedPolicyId) return;
    setSaving(true);
    try {
      await api.put(`/api/policies/${selectedPolicyId}`, {
        memory_injection_rules: rules,
        context_strategy: contextStrategy,
      });
      setDirty(false);
      setErr("");
      // Refresh
      const updated = await api.get<Policy[]>(`/api/policies`);
      setPolicies(updated);
    } catch (e: any) { setErr(e?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const runPreview = async () => {
    if (!sessionId.trim()) return;
    setPreviewLoading(true);
    setPreviewResult("");
    try {
      const strat = contextStrategy.strategy;
      const res = await api.get<{ context: string; tokens_estimate: number }>(
        `/api/sessions/${encodeURIComponent(sessionId.trim())}/memory/context?max_tokens=${contextStrategy.max_tokens}&strategy=${strat}`
      );
      setPreviewResult(res.context || "(empty context)");
    } catch (e: any) {
      setPreviewResult(`Error: ${e?.message || e}`);
    } finally { setPreviewLoading(false); }
  };

  const openNewRule = () => {
    setEditingRuleIdx(null);
    setRuleForm({ field: "custom", content: "", inject_at: "always", priority: 0 });
    setRuleDialog(true);
  };

  const openEditRule = (idx: number) => {
    setEditingRuleIdx(idx);
    setRuleForm({ ...rules[idx] });
    setRuleDialog(true);
  };

  const saveRule = () => {
    if (editingRuleIdx !== null) {
      const updated = [...rules];
      updated[editingRuleIdx] = ruleForm;
      setRules(updated);
    } else {
      setRules([...rules, ruleForm]);
    }
    setDirty(true);
    setRuleDialog(false);
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const injectBadge = (mode: string) => {
    const opt = INJECT_OPTIONS.find((o) => o.value === mode);
    const v = mode === "always" ? "default" : mode === "first_only" ? "secondary" : mode === "every_n" ? "outline" : "destructive" as const;
    return <Badge variant={v} className="text-[10px]">{opt?.label || mode}</Badge>;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memory</h1>
        <div className="flex gap-2">
          {dirty && (
            <Button onClick={savePolicy} disabled={saving}>
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save changes"}
            </Button>
          )}
        </div>
      </div>

      <ErrorAlert message={err} />

      {/* ── Policy selector ── */}
      <div className="mb-4 flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap">Policy:</Label>
        <select value={selectedPolicyId || ""}
          onChange={(e) => { setSelectedPolicyId(e.target.value || null); setDirty(false); }}
          className="flex h-9 max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
          <option value="">— Select a policy —</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {selectedPolicy && (
          <Badge variant="outline" className="text-xs">{selectedPolicy.description}</Badge>
        )}
      </div>

      {!selectedPolicyId && (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          Select a policy to configure its memory injection rules and context strategy.
        </CardContent></Card>
      )}

      {selectedPolicyId && (
        <div className="grid gap-6 xl:grid-cols-5">

          {/* ──────── LEFT: Rules + Context Strategy ──────── */}
          <div className="space-y-6 xl:col-span-3">

            {/* ── 1. Injection Rules ── */}
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  Memory Injection Rules
                  <Tooltip content="Rules that determine what context is injected into the LLM prompt at each turn.">
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                  </Tooltip>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={openNewRule}>
                  <Plus className="h-3 w-3 mr-1" /> Add Rule
                </Button>
              </CardHeader>
              <CardContent>
                {rules.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3">
                    No memory injection rules. Conversation turns will be passed as-is without extra context.
                  </p>
                )}
                {rules.map((rule, i) => {
                  const fieldLabel = FIELD_OPTIONS.find((f) => f.value === rule.field)?.label || rule.field;
                  return (
                    <div key={i} className="flex items-start gap-2 border-b py-2.5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{fieldLabel}</Badge>
                          {injectBadge(rule.inject_at)}
                          <span className="text-[10px] text-muted-foreground">priority {rule.priority}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{rule.content || "\u2014"}</div>
                      </div>
                      <div className="flex gap-1 shrink-0 pt-0.5">
                        <Button variant="ghost" size="sm" onClick={() => openEditRule(i)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeRule(i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* ── 2. Context Strategy ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Context Strategy
                  <Tooltip content="How the system manages context window limits when memory and conversation turns exceed the token budget.">
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  {STRATEGY_OPTIONS.map((s) => {
                    const active = contextStrategy.strategy === s.value;
                    return (
                      <button key={s.value}
                        onClick={() => { setContextStrategy((c) => ({ ...c, strategy: s.value as ContextStrategy["strategy"] })); setDirty(true); }}
                        className={`rounded-lg border p-3 text-left transition-all text-xs ${
                          active ? "ring-2 ring-primary border-primary bg-accent" : "hover:border-border"
                        }`}>
                        <div className="font-medium text-sm mb-0.5">{s.label}</div>
                        <div className="text-muted-foreground">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Max tokens (total)</Label>
                    <Input type="number" min={100} max={128000} step={100}
                      value={contextStrategy.max_tokens}
                      onChange={(e) => { setContextStrategy((c) => ({ ...c, max_tokens: parseInt(e.target.value) || 4000 })); setDirty(true); }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">System budget</Label>
                    <Input type="number" min={0} max={contextStrategy.max_tokens}
                      value={contextStrategy.system_budget ?? 500}
                      onChange={(e) => { setContextStrategy((c) => ({ ...c, system_budget: parseInt(e.target.value) || 0 })); setDirty(true); }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Memory budget</Label>
                    <Input type="number" min={0} max={contextStrategy.max_tokens}
                      value={contextStrategy.memory_budget ?? 1000}
                      onChange={(e) => { setContextStrategy((c) => ({ ...c, memory_budget: parseInt(e.target.value) || 0 })); setDirty(true); }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ──────── RIGHT: Context Visual + Preview ──────── */}
          <div className="space-y-6 xl:col-span-2">

            {/* ── 3. Token Budget Visual ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  Token Budget
                  <Tooltip content="Visual breakdown of context window allocation.">
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">

                {/* Visual bar */}
                <div className="h-8 w-full rounded-full bg-muted overflow-hidden flex">
                  {systemPct > 0 && (
                    <div className="h-full bg-blue-500/80 flex items-center justify-center text-[9px] text-white font-medium transition-all"
                      style={{ width: `${systemPct}%`, minWidth: systemPct > 5 ? "fit-content" : undefined }}>
                      {systemPct > 5 && "System"}
                    </div>
                  )}
                  {memoryPct > 0 && (
                    <div className="h-full bg-emerald-500/80 flex items-center justify-center text-[9px] text-white font-medium transition-all"
                      style={{ width: `${memoryPct}%`, minWidth: memoryPct > 5 ? "fit-content" : undefined }}>
                      {memoryPct > 5 && "Memory"}
                    </div>
                  )}
                  {turnsPct > 0 && (
                    <div className="h-full bg-amber-500/80 flex items-center justify-center text-[9px] text-white font-medium transition-all"
                      style={{ width: `${turnsPct}%`, minWidth: turnsPct > 5 ? "fit-content" : undefined }}>
                      {turnsPct > 5 && "Turns"}
                    </div>
                  )}
                  {freePct > 0 && (
                    <div className="h-full flex items-center justify-center text-[9px] text-muted-foreground font-medium"
                      style={{ width: `${freePct}%`, minWidth: freePct > 5 ? "fit-content" : undefined }}>
                      {freePct > 5 && "Free"}
                    </div>
                  )}
                </div>

                {/* Legend + numbers */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded bg-blue-500/80" />
                    <span className="text-muted-foreground">System:</span>
                    <span className="font-mono">{contextStrategy.system_budget ?? 0}t</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded bg-emerald-500/80" />
                    <span className="text-muted-foreground">Memory:</span>
                    <span className="font-mono">{contextStrategy.memory_budget ?? 0}t</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded bg-amber-500/80" />
                    <span className="text-muted-foreground">Turns:</span>
                    <span className="font-mono">{contextStrategy.turns_budget ?? 0}t</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded bg-muted-foreground/30" />
                    <span className="text-muted-foreground">Free:</span>
                    <span className="font-mono">{Math.max(0, freeBudget)}t</span>
                  </div>
                  <div className="col-span-2 text-right text-muted-foreground">
                    Total: <span className="font-mono font-medium">{totalBudget}t</span>
                  </div>
                </div>

                {freeBudget < 0 && (
                  <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                    ⚠ Over budget by {Math.abs(freeBudget)} tokens. Reduce one of the budgets above.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── 4. Context Preview ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Play className="h-4 w-4 text-muted-foreground" />
                  Context Preview
                  <Tooltip content="Enter a session ID to preview how the context would be assembled.">
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    placeholder="Session ID to preview context..."
                    className="flex-1 text-xs font-mono" />
                  <Button size="sm" variant="secondary" onClick={runPreview} disabled={!sessionId.trim() || previewLoading}>
                    {previewLoading ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : null}
                    Preview
                  </Button>
                </div>

                {previewResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="h-3 w-3" />
                      Assembled context ({contextStrategy.strategy}):
                    </div>
                    <pre className="rounded border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {previewResult}
                    </pre>
                  </div>
                )}

                {!sessionId.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Provide a session ID to test how memory and injection rules would render for a real conversation.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── 5. Injection timeline ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  Injection Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 text-xs">
                  {rules.length === 0 && (
                    <p className="text-muted-foreground">No rules defined.</p>
                  )}
                  {rules.map((rule, i) => {
                    let timeline: string;
                    switch (rule.inject_at) {
                      case "always": timeline = "T0, T1, T2, ..."; break;
                      case "first_only": timeline = "T0 only"; break;
                      case "every_n": timeline = `Every ${rule.inject_every_n || 1} turns`; break;
                      default: timeline = "Never";
                    }
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] shrink-0">{FIELD_OPTIONS.find(f => f.value === rule.field)?.label || rule.field}</Badge>
                        <span className="text-muted-foreground">{timeline}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* ════════════ Rule Dialog ════════════ */}
      <Dialog open={ruleDialog} onOpenChange={(v) => { if (!v) setRuleDialog(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRuleIdx !== null ? "Edit Rule" : "New Memory Rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Field</Label>
                <select value={ruleForm.field}
                  onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Inject at</Label>
                <select value={ruleForm.inject_at}
                  onChange={(e) => setRuleForm({ ...ruleForm, inject_at: e.target.value as MemoryInjectionRule["inject_at"] })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  {INJECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {ruleForm.inject_at === "every_n" && (
              <div className="space-y-1">
                <Label className="text-xs">Every N turns</Label>
                <Input type="number" min={1} max={100} value={ruleForm.inject_every_n || 1}
                  onChange={(e) => setRuleForm({ ...ruleForm, inject_every_n: parseInt(e.target.value) || 1 })} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Content</Label>
              <textarea value={ruleForm.content}
                onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                placeholder={ruleForm.field === "date" ? "(auto-populated)" : "e.g. You are a helpful assistant specialized in..."} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Input type="number" min={0} max={100} value={ruleForm.priority}
                onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 0 })} />
              <p className="text-[10px] text-muted-foreground">Higher priority rules are injected first when token budget is limited.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancel</Button>
            <Button onClick={saveRule} disabled={!ruleForm.content.trim() && ruleForm.field !== "date"}>
              {editingRuleIdx !== null ? "Update" : "Add Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}