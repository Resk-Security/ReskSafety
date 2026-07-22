import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Policy, PolicyConfig } from "@/lib/types";
import { Button, ErrorAlert, Badge, Tooltip, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { PolicyEditor, PolicyForm, emptyPolicyForm, policyToForm } from "@/components/policy/PolicyEditor";
import {
  Save, ArrowLeft, Trash2, Search, Lock, BrainCircuit, Database, FlaskConical, Plus, AlertTriangle,
  HelpCircle, Info, PlusCircle, X, RefreshCw, Layers, MessageSquare, Settings2, FileText,
} from "lucide-react";

type Tab = "general" | "memory" | "context";

interface MemRule {
  field: string;
  content: string;
  inject_at: string;
  priority: number;
}

export function PolicyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<PolicyForm>(emptyPolicyForm());
  const [origForm, setOrigForm] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("general");

  const [memRules, setMemRules] = useState<MemRule[]>([]);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState<MemRule>({ field: "custom", content: "", inject_at: "every", priority: 5 });

  const [sdConfigs, setSdConfigs] = useState<PolicyConfig[]>([]);
  const [aclConfigs, setAclConfigs] = useState<PolicyConfig[]>([]);
  const [cfConfigs, setCfConfigs] = useState<PolicyConfig[]>([]);
  const [spConfigs, setSpConfigs] = useState<PolicyConfig[]>([]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    api.get<Policy>(`/api/policies/${id}`)
      .then((p) => {
        const f = policyToForm(p);
        setForm(f);
        setOrigForm(JSON.stringify(f));
        setMemRules((p as any).memory_injection_rules ?? []);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api.get<PolicyConfig[]>("/api/policy-configs?type=semantic_detection").then(setSdConfigs).catch(() => {});
    api.get<PolicyConfig[]>("/api/policy-configs?type=access_control").then(setAclConfigs).catch(() => {});
    api.get<PolicyConfig[]>("/api/policy-configs?type=classifiers").then(setCfConfigs).catch(() => {});
    api.get<PolicyConfig[]>("/api/policy-configs?type=scanning_pipeline").then(setSpConfigs).catch(() => {});
  }, []);

  const isDirty = JSON.stringify(form) !== origForm || (id && JSON.stringify(memRules) !== JSON.stringify((form as any).memory_injection_rules));
  const isNew = !id;

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const payload: Record<string, any> = {
        name: form.name, description: form.description, rules: form.rules,
        memory_injection_rules: memRules,
      };
      if (form.semantic_detection_config_id) payload.semantic_detection_config_id = form.semantic_detection_config_id;
      else if (form.semantic_detection) payload.semantic_detection = form.semantic_detection;
      if (form.access_control_config_id) payload.access_control_config_id = form.access_control_config_id;
      else if (form.access_control) payload.access_control = form.access_control;
      if (form.classifiers_config_id) payload.classifiers_config_id = form.classifiers_config_id;
      else if (form.classifiers) payload.classifiers = form.classifiers;
      if (form.scanning_pipeline_config_id) payload.scanning_pipeline_config_id = form.scanning_pipeline_config_id;
      else if (form.scanning_pipeline) payload.scanning_pipeline = form.scanning_pipeline;

      if (isNew) {
        const created = await api.post<Policy>("/api/policies", payload);
        navigate(`/policies/${created.id}`, { replace: true });
      } else {
        await api.put(`/api/policies/${id}`, payload);
        setOrigForm(JSON.stringify(form));
      }
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!id || !confirm("Delete this policy?")) return;
    try { await api.del(`/api/policies/${id}`); navigate("/policies", { replace: true }); }
    catch (e) { setErr(String(e)); }
  }

  function selectedLabel(configs: PolicyConfig[], id: string | null): string {
    const c = configs.find((x) => x.id === id);
    return c ? c.name : "(none)";
  }

  const addRule = () => {
    if (!ruleForm.content.trim()) return;
    if (editingRule !== null) {
      const updated = [...memRules];
      updated[editingRule] = ruleForm;
      setMemRules(updated);
    } else {
      setMemRules([...memRules, ruleForm]);
    }
    setRuleForm({ field: "custom", content: "", inject_at: "every", priority: 5 });
    setEditingRule(null);
  };

  const editRule = (idx: number) => {
    setRuleForm(memRules[idx]);
    setEditingRule(idx);
  };

  const removeRule = (idx: number) => {
    setMemRules(memRules.filter((_, i) => i !== idx));
    if (editingRule === idx) { setEditingRule(null); setRuleForm({ field: "custom", content: "", inject_at: "every", priority: 5 }); }
  };

  const contextStrats = [
    { value: "truncate", label: "Truncate", desc: "Drop the oldest turns when the context window is full.", icon: Trash2 },
    { value: "summarize", label: "Summarize", desc: "Compress old turns into summaries to free tokens.", icon: FileText },
    { value: "fail", label: "Fail", desc: "Block the request if the context is full.", icon: X },
    { value: "roll_window", label: "Roll Window", desc: "Keep only the N most recent turns.", icon: RefreshCw },
  ];

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/policies")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{isNew ? "New policy" : form.name || "Untitled"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isNew ? "Create a new security policy" : "Edit policy configuration"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/policies/${id}/semantic-detection`)}>
                <Search className="mr-1 h-4 w-4" /> Semantic
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/policies/${id}/access-control`)}>
                <Lock className="mr-1 h-4 w-4" /> ACL
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/policies/${id}/classifiers`)}>
                <BrainCircuit className="mr-1 h-4 w-4" /> Classifiers
              </Button>
              <Button variant="outline" size="sm" onClick={remove}>
                <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Delete
              </Button>
            </>
          )}
          <Button onClick={save} disabled={saving || !isDirty} size="sm">
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      <ErrorAlert message={err} />

      {/* ── Tabs ── */}
      <div className="flex gap-4 border-b mb-6">
        {(["general", "memory"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize transition-colors flex items-center gap-1.5 ${
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "general" && <Settings2 className="h-4 w-4" />}
            {t === "memory" && <Database className="h-4 w-4" />}
            {t === "general" ? "General" : "Memory Rules"}
          </button>
        ))}
      </div>

      {/* ════════════ TAB: General ════════════ */}
      {tab === "general" && (
        <div className="space-y-6">
          <PolicyEditor policy={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

          <div className="rounded border p-4 space-y-4">
            <h2 className="text-sm font-medium">Attach configs</h2>
            <p className="text-xs text-muted-foreground">Attach reusable configs created in the dedicated tabs.</p>

            {([["semantic_detection", "Semantic Detection", Search, sdConfigs, "/policies/semantic-detection"],
               ["access_control", "Access Control", Lock, aclConfigs, "/policies/access-control"],
               ["classifiers", "Classifiers", FlaskConical, cfConfigs, "/policies/classifiers"],
               ["scanning_pipeline", "Scanning Pipeline", AlertTriangle, spConfigs, "/policies/scanning-pipeline"],
            ] as const).map(([key, label, Icon, configs, createRoute]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Icon className="h-3 w-3" /> {label}
                </label>
                <div className="flex items-center gap-2">
                  <select value={(form as any)[`${key}_config_id`] || ""}
                    onChange={(e) => setForm((f) => ({ ...f, [`${key}_config_id`]: e.target.value || null }))}
                    className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— None —</option>
                    {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button variant="outline" size="sm" onClick={() => navigate(createRoute)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {!isNew && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-4">
              <span className="font-medium">Quick links:</span>
              {(["semantic-detection", "access-control", "classifiers"] as const).map((route) => (
                <button key={route} onClick={() => navigate(`/policies/${id}/${route}`)}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent transition-colors">
                  {route === "semantic-detection" && <Search className="h-3 w-3" />}
                  {route === "access-control" && <Lock className="h-3 w-3" />}
                  {route === "classifiers" && <BrainCircuit className="h-3 w-3" />}
                  {route.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB: Memory Rules ════════════ */}
      {tab === "memory" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4 text-muted-foreground" />
                <Tooltip content="Rules that inject content into the agent's context at specific turns.
                  'every' = every turn, 'first_only' = turn 0 only, 'never' = manual only.">
                  <span className="underline decoration-dotted underline-offset-4 cursor-help">Memory Injection Rules</span>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {memRules.length === 0 && (
                <div className="text-xs text-muted-foreground mb-4">No memory rules defined yet. Add one below.</div>
              )}
              {memRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 border-b py-2 text-sm last:border-0 group">
                  <Badge variant="outline" className="shrink-0 text-[10px] mt-0.5">{rule.field}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs">{rule.content}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={rule.inject_at === "every" ? "default" : rule.inject_at === "first_only" ? "secondary" : "outline"} className="text-[10px]">{rule.inject_at}</Badge>
                    <span className="text-[10px] text-muted-foreground">p{rule.priority}</span>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6" onClick={() => editRule(i)}>
                      <Settings2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6" onClick={() => removeRule(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="mt-4 rounded border p-3 space-y-3">
                <span className="text-xs font-medium">{editingRule !== null ? "Edit Rule" : "Add Rule"}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Field</label>
                    <select value={ruleForm.field} onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}
                      className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs">
                      <option value="custom">Custom</option>
                      <option value="date">Current Date</option>
                      <option value="user_profile">User Profile</option>
                      <option value="session_summary">Session Summary</option>
                    </select>
                  </div>
                  <div className="group relative">
                    <label className="text-[10px] text-muted-foreground">Inject at</label>
                    <select value={ruleForm.inject_at} onChange={(e) => setRuleForm({ ...ruleForm, inject_at: e.target.value })}
                      className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs">
                      <option value="every">Every turn</option>
                      <option value="first_only">First turn only</option>
                      <option value="never">Never (manual)</option>
                    </select>
                    <Tooltip content="'Every turn': injected each time. 'First turn only': only on turn 0. 'Never': stored but not auto-injected.">
                      <HelpCircle className="absolute right-1 top-5 h-3 w-3 text-muted-foreground/60" />
                    </Tooltip>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Content</label>
                  <textarea value={ruleForm.content} onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })}
                    className="flex min-h-[60px] w-full rounded border border-input bg-transparent px-2 py-1 text-xs"
                    placeholder="Instruction or context to inject..." />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-muted-foreground">Priority</label>
                    <input type="number" value={ruleForm.priority}
                      onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 0 })}
                      className="h-7 w-16 rounded border border-input bg-transparent px-2 text-xs" />
                  </div>
                  <div className="flex gap-2">
                    {editingRule !== null && (
                      <Button variant="outline" size="sm" onClick={() => { setEditingRule(null); setRuleForm({ field: "custom", content: "", inject_at: "every", priority: 5 }); }}>
                        Cancel
                      </Button>
                    )}
                    <Button size="sm" onClick={addRule} disabled={!ruleForm.content.trim()}>
                      <PlusCircle className="mr-1 h-3 w-3" /> {editingRule !== null ? "Update" : "Add"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ════════════ TAB: Context Visualizer ════════════ */}
      {tab === "context" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Layers className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              Context strategy and injection rules are managed from the dedicated{" "}
              <button onClick={() => navigate("/memory")} className="text-primary hover:underline font-medium cursor-pointer">Memory page</button>.
              <div className="mt-2 text-xs">
                Go to <button onClick={() => navigate("/memory")} className="text-primary hover:underline cursor-pointer">Memory →</button> to configure context budgets, preview assembly, and manage injection timelines.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
