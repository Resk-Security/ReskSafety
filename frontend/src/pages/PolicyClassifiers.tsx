import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyConfig, ClassifiersConfig, ClassifierRule } from "@/lib/types";
import {
  Button, Input, Label, ErrorAlert, Tooltip,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Save, ArrowLeft, FlaskConical } from "lucide-react";

const ACTIONS = ["allow", "deny", "warn", "block"];
const CATEGORIES = [
  "toxicity", "pii", "jailbreak", "sentiment", "self_harm", "sexual",
  "violence", "harassment", "custom",
  "prompt_injection", "code_injection", "malicious_url", "phishing",
];
const LOGIT_LEVELS = ["high", "medium", "low"] as const;

const EXAMPLE_RULES: ClassifierRule[] = [
  { name: "Toxic content", model: "unitary/toxic-bert", enabled: true, threshold: 0.7, action: "block", category: "toxicity" },
  { name: "PII detection", model: "obi/deid_roberta_i2b2", enabled: true, threshold: 0.8, action: "block", category: "pii" },
  { name: "Jailbreak detection", model: "protectai/deberta-v3-base-prompt-injection", enabled: true, threshold: 0.6, action: "deny", category: "jailbreak" },
  { name: "Sentiment analysis", model: "cardiffnlp/twitter-roberta-base-sentiment-latest", enabled: true, threshold: 0.9, action: "warn", category: "sentiment" },
  { name: "Self-harm detection", model: "ml6team/distilbert-base-uncased-self-harm-detection", enabled: true, threshold: 0.75, action: "block", category: "self_harm" },
  { name: "Prompt injection", model: "meta-llama/Prompt-Guard-86M", enabled: true, threshold: 0.65, action: "deny", category: "prompt_injection" },
];

function defaultCfConfig(): ClassifiersConfig {
  return {
    enabled: true, rules: [],
    shadow_penalty: -15.0,
    multi_level: { enabled: false, penalties: { high: -20.0, medium: -10.0, low: -5.0 } },
  };
}

function emptyForm() {
  return { name: "", description: "", config: defaultCfConfig() };
}

export function PolicyClassifiers() {
  const [configs, setConfigs] = useState<PolicyConfig[]>([]);
  const [editing, setEditing] = useState<PolicyConfig | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; config: ClassifiersConfig }>(emptyForm());
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setConfigs(await api.get<PolicyConfig[]>(`/api/policy-configs?type=classifiers`));
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function startCreate() { setEditing(null); setForm(emptyForm()); }
  function startEdit(c: PolicyConfig) { setEditing(c); setForm({ name: c.name, description: c.description, config: c.config as ClassifiersConfig }); }
  function cancelEdit() { setEditing(null); setForm(emptyForm()); setErr(""); }

  async function save() {
    if (!form.name) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      if (editing) {
        await api.put(`/api/policy-configs/${editing.id}`, { name: form.name, description: form.description, config: form.config });
      } else {
        await api.post("/api/policy-configs", { name: form.name, description: form.description, config_type: "classifiers", config: form.config });
      }
      cancelEdit();
      load();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function remove(c: PolicyConfig) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api.del(`/api/policy-configs/${c.id}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  function updateRule(i: number, patch: Partial<ClassifierRule>) {
    setForm((f) => ({ ...f, config: { ...f.config, rules: f.config.rules.map((r, idx) => idx === i ? { ...r, ...patch } : r) } }));
  }

  function removeRule(i: number) {
    setForm((f) => ({ ...f, config: { ...f.config, rules: f.config.rules.filter((_, idx) => idx !== i) } }));
  }

  function addRule() {
    setForm((f) => ({ ...f, config: { ...f.config, rules: [...f.config.rules, { name: "", model: "", enabled: true, threshold: 0.7, action: "warn", category: "custom" }] } }));
  }

  function loadExamples() {
    setForm((f) => {
      if (f.config.rules.length > 0 && !confirm("Append example rules?")) return f;
      return { ...f, config: { ...f.config, rules: [...f.config.rules, ...EXAMPLE_RULES] } };
    });
  }

  /* ── Editor mode ── */
  if (editing !== undefined) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={cancelEdit}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="text-2xl font-semibold">{editing ? `Edit: ${editing.name}` : "New classifiers config"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">ML-based content classifiers for toxicity, PII, jailbreak, and more.</p>
            </div>
          </div>
          <Button onClick={save} disabled={saving || !form.name}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </div>

        <ErrorAlert message={err} />

        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Toxicity + PII guard" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this config detects" />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
              <input type="checkbox" checked={form.config.enabled}
                onChange={(e) => setForm({ ...form, config: { ...form.config, enabled: e.target.checked } })} className="peer sr-only" />
              <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-4" />
            </label>
            <span className="font-medium text-sm">Enable classifiers</span>
            <Tooltip content="Run ML models to classify content">
              <span className="text-muted-foreground/60 cursor-help text-xs">[?]</span>
            </Tooltip>
          </div>

          <div className={`space-y-4 ${form.config.enabled ? "" : "pointer-events-none opacity-40"}`}>
            <div className="rounded border p-3 space-y-2 bg-muted/20">
              <span className="text-sm font-medium">How it works</span>
              <p className="text-xs text-muted-foreground">
                Each classifier produces a score (0–1); if the score exceeds the <strong>threshold</strong>,
                the configured <strong>action</strong> is applied.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Classifier rules</span>
                <p className="text-xs text-muted-foreground">Each rule defines a model, category, threshold, and action.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadExamples}><FlaskConical className="h-3 w-3 mr-1" /> Load examples</Button>
                <Button variant="outline" size="sm" onClick={addRule}><Plus className="h-3 w-3 mr-1" /> Add rule</Button>
              </div>
            </div>

            <div className="space-y-2">
              {form.config.rules.map((rule, i) => (
                <div key={i} className="rounded border p-3 space-y-2 hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex h-4 w-7 cursor-pointer items-center">
                        <input type="checkbox" checked={rule.enabled}
                          onChange={(e) => updateRule(i, { enabled: e.target.checked })} className="peer sr-only" />
                        <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary" />
                        <span className="absolute left-0.5 h-3 w-3 rounded-full bg-background transition-transform peer-checked:translate-x-3" />
                      </label>
                      <span className="text-sm font-medium">{rule.name}</span>
                    </div>
                    <button onClick={() => removeRule(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Model</Label>
                      <Input value={rule.model} onChange={(e) => updateRule(i, { model: e.target.value })} className="h-8 text-xs font-mono" placeholder="HuggingFace model ID" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <select value={rule.category} onChange={(e) => updateRule(i, { category: e.target.value })}
                        className="w-full rounded border border-input bg-background px-3 py-2 text-sm">
                        {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Threshold</Label>
                      <div className="flex items-center gap-2">
                        <input type="range" min="0" max="1" step="0.05" value={rule.threshold}
                          onChange={(e) => updateRule(i, { threshold: parseFloat(e.target.value) })} className="flex-1 accent-primary h-1.5" />
                        <span className="text-xs font-mono w-8">{rule.threshold.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Action</Label>
                      <select value={rule.action} onChange={(e) => updateRule(i, { action: e.target.value })}
                        className="w-full rounded border border-input bg-background px-3 py-2 text-sm">
                        {ACTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {form.config.rules.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No rules yet. Click "Load examples" or "Add rule".</p>
              )}
            </div>

            <div className="rounded border p-3 space-y-2">
              <span className="text-sm font-medium">Logits filtering</span>
              <p className="text-xs text-muted-foreground">ShadowBanProcessor settings for token-level banning.</p>
              <div className="space-y-1">
                <Label className="text-xs">Shadow penalty</Label>
                <div className="flex items-center gap-2">
                  <input type="range" min="-30" max="-5" step="1" value={form.config.shadow_penalty}
                    onChange={(e) => setForm({ ...form, config: { ...form.config, shadow_penalty: parseFloat(e.target.value) } })} className="flex-1 accent-primary" />
                  <span className="text-xs font-mono w-10">{form.config.shadow_penalty}</span>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.config.multi_level.enabled}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, multi_level: { ...form.config.multi_level, enabled: e.target.checked } } })} className="h-3.5 w-3.5 rounded border-input accent-primary" />
                Multi-level penalties
              </label>
              {form.config.multi_level.enabled && (
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                  {LOGIT_LEVELS.map((lvl) => (
                    <div key={lvl}>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">{lvl}</span>
                      <input type="number" value={form.config.multi_level.penalties[lvl] ?? 0}
                        onChange={(e) => setForm({ ...form, config: { ...form.config, multi_level: { ...form.config.multi_level, penalties: { ...form.config.multi_level.penalties, [lvl]: parseFloat(e.target.value) || 0 } } } })}
                        className="w-full h-7 rounded border border-input bg-background px-1.5 text-xs" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── List mode ── */
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Classifiers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable ML classifier configs. Create, edit, and later attach them to policies.
          </p>
        </div>
        <Button onClick={startCreate}><Plus className="mr-1 h-4 w-4" /> New config</Button>
      </div>

      <ErrorAlert message={err} />

      {configs.length === 0 ? (
        <div className="rounded border p-8 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No classifier configs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to define ML model rules and logits filtering. Then attach it to a policy.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={startCreate}>
            <Plus className="h-3 w-3 mr-1" /> Create your first config
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((c) => (
            <div key={c.id} className="rounded border p-3 flex items-center justify-between hover:bg-accent/30 transition-colors">
              <div>
                <span className="text-sm font-medium">{c.name}</span>
                <p className="text-xs text-muted-foreground">{c.description || "\u2014"}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {(c.config as ClassifiersConfig).rules?.length ?? 0} rules
                  </span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    shadow: {(c.config as ClassifiersConfig).shadow_penalty}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
