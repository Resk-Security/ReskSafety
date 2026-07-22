import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Button, Input, Label, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Badge, Card, CardContent, ErrorAlert, Tooltip,
} from "@/components/ui";
import { Plus, Trash2, Pencil, ArrowLeft, Shield, Cpu, HelpCircle, RefreshCw, X, ChevronDown, ChevronRight } from "lucide-react";
import type { ModelEntity, ModelSecurityInfo, ModelTokenizerConfig, Provider } from "@/lib/types";

export function ProviderModels() {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelEntity[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [secInfo, setSecInfo] = useState<ModelSecurityInfo | null>(null);
  const [tokenizerOpen, setTokenizerOpen] = useState<string | null>(null);
  const [tokenizerForm, setTokenizerForm] = useState<ModelTokenizerConfig | null>(null);
  const [tokenizerExpanded, setTokenizerExpanded] = useState(false);
  const [newCustomToken, setNewCustomToken] = useState("");
  const [detecting, setDetecting] = useState(false);

  const [form, setForm] = useState({
    name: "", type: "remote", temperature: "", top_k: "",
    max_tokens: "", context_window: "", response_length_limit: "",
    context_full_strategy: "truncate", is_active: true,
  });

  const load = () => {
    if (!providerId) return;
    api.get<Provider>(`/api/providers/${providerId}`).then(setProvider).catch(() => {});
    api.get<ModelEntity[]>(`/api/providers/${providerId}/models`).then(setModels).catch(() => {});
  };

  useEffect(() => { load(); }, [providerId]);

  const resetForm = () => {
    setForm({ name: "", type: "remote", temperature: "", top_k: "",
      max_tokens: "", context_window: "", response_length_limit: "",
      context_full_strategy: "truncate", is_active: true });
    setEditing(null);
  };

  const openEdit = (m: ModelEntity) => {
    setForm({
      name: m.name, type: m.type,
      temperature: m.temperature?.toString() ?? "",
      top_k: m.top_k?.toString() ?? "",
      max_tokens: m.max_tokens?.toString() ?? "",
      context_window: m.context_window?.toString() ?? "",
      response_length_limit: m.response_length_limit?.toString() ?? "",
      context_full_strategy: m.context_full_strategy, is_active: m.is_active,
    });
    setEditing(m.id);
    setOpen(true);
  };

  const save = async () => {
    setErr("");
    try {
      const payload: Record<string, any> = {
        name: form.name, type: form.type,
        provider_id: providerId,
        context_full_strategy: form.context_full_strategy, is_active: form.is_active,
      };
      if (form.temperature) payload.temperature = parseFloat(form.temperature);
      if (form.top_k) payload.top_k = parseInt(form.top_k);
      if (form.max_tokens) payload.max_tokens = parseInt(form.max_tokens);
      if (form.context_window) payload.context_window = parseInt(form.context_window);
      if (form.response_length_limit) payload.response_length_limit = parseInt(form.response_length_limit);

      if (editing) {
        await api.put(`/api/models/${editing}`, payload);
      } else {
        await api.post("/api/models", payload);
      }
      setOpen(false);
      resetForm();
      load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
  };

  const remove = async (id: string) => {
    await api.del(`/api/models/${id}`);
    load();
  };

  const showSecurity = async (id: string) => {
    try {
      setSecInfo(await api.get<ModelSecurityInfo>(`/api/models/${id}/security`));
    } catch { setSecInfo(null); }
  };

  const openTokenizer = (m: ModelEntity) => {
    setTokenizerForm(m.tokenizer_config || {
      model_name: m.name, tokenizer_name: null, trust_remote_code: false,
      add_prefix_space: false, custom_special_tokens: [], detected_special_tokens: {}, detected_special_token_ids: [],
    });
    setTokenizerExpanded(false);
    setTokenizerOpen(m.id);
  };

  const saveTokenizer = async () => {
    if (!tokenizerOpen || !tokenizerForm) return;
    try {
      await api.put(`/api/models/${tokenizerOpen}`, { tokenizer_config: tokenizerForm });
      setTokenizerOpen(null);
      load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
  };

  const detectTokens = async () => {
    if (!tokenizerForm) return;
    setDetecting(true);
    setErr("");
    try {
      const result = await api.post<{ detected_special_tokens: Record<string, string>; detected_special_token_ids: number[] }>(
        `/api/settings/tokenizer/${encodeURIComponent(tokenizerForm.model_name)}/detect`,
        { tokenizer_name: tokenizerForm.tokenizer_name, trust_remote_code: tokenizerForm.trust_remote_code, add_prefix_space: tokenizerForm.add_prefix_space, custom_special_tokens: tokenizerForm.custom_special_tokens },
      );
      setTokenizerForm((f) => f ? { ...f, detected_special_tokens: result.detected_special_tokens, detected_special_token_ids: result.detected_special_token_ids } : f);
    } catch (e) { setErr(String(e)); }
    finally { setDetecting(false); }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/providers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">
          {provider?.name ?? "Provider"} <span className="text-muted-foreground text-lg">· Models</span>
        </h1>
        <div className="flex-1" />
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Model
        </Button>
      </div>

      <ErrorAlert message={err} />

      {models.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          No models configured for this provider. Create one or sync from the provider's API.
        </CardContent></Card>
      )}

      {models.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH className="group relative">
                Temp
                <Tooltip content="Default temperature for this model.">
                  <HelpCircle className="ml-1 inline h-3 w-3 text-muted-foreground/60" />
                </Tooltip>
              </TH>
              <TH className="group relative">
                Top-K
                <Tooltip content="Limits token sampling to the K most likely tokens.">
                  <HelpCircle className="ml-1 inline h-3 w-3 text-muted-foreground/60" />
                </Tooltip>
              </TH>
              <TH className="group relative">
                Context
                <Tooltip content="Maximum context window size in tokens.">
                  <HelpCircle className="ml-1 inline h-3 w-3 text-muted-foreground/60" />
                </Tooltip>
              </TH>
              <TH className="group relative">
                Strategy
                <Tooltip content="What happens when the context window is full.">
                  <HelpCircle className="ml-1 inline h-3 w-3 text-muted-foreground/60" />
                </Tooltip>
              </TH>
              <TH>Active</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {models.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD><Badge variant="outline">{m.type}</Badge></TD>
                <TD className="font-mono text-xs">{m.temperature ?? "\u2014"}</TD>
                <TD className="font-mono text-xs">{m.top_k ?? "\u2014"}</TD>
                <TD className="font-mono text-xs">{m.context_window ? `${(m.context_window / 1000).toFixed(0)}k` : "\u2014"}</TD>
                <TD>
                  <Tooltip content={
                    m.context_full_strategy === "truncate" ? "Drop oldest turns when full" :
                    m.context_full_strategy === "summarize" ? "Summarize old turns to free space" :
                    m.context_full_strategy === "fail" ? "Block requests when context is full" :
                    "Keep a sliding window of recent turns"
                  }>
                    <Badge variant="secondary" className="cursor-help">{m.context_full_strategy}</Badge>
                  </Tooltip>
                </TD>
                <TD><Badge variant={m.is_active ? "default" : "destructive"}>{m.is_active ? "active" : "inactive"}</Badge></TD>
                <TD>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => showSecurity(m.id)} title="Security">
                      <Shield className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openTokenizer(m)} title="Configure tokenizer">
                      <Cpu className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(m.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {secInfo && (
        <Dialog open={!!secInfo} onOpenChange={(v) => { if (!v) setSecInfo(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Security — {secInfo.model_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Policies ({secInfo.policies.length})</h4>
                {secInfo.policies.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-xs">{p.policy_id.slice(0, 8)}...</span>
                    {p.hook_id && <Badge variant="outline" className="text-[10px]">hook</Badge>}
                  </div>
                ))}
                {secInfo.policies.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Hooks ({secInfo.hooks.length})</h4>
                {secInfo.hooks.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Cpu className="h-3.5 w-3.5 text-secondary" />
                    <span>{h.name}</span>
                    <Badge variant="outline" className="text-[10px]">{h.type}</Badge>
                    <Badge variant={h.action === "block" ? "destructive" : "secondary"} className="text-[10px]">{h.action}</Badge>
                  </div>
                ))}
                {secInfo.hooks.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSecInfo(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Model" : "New Model"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="gpt-4o" />
              </div>
              <div>
                <Label>Type</Label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="remote">Remote</option>
                  <option value="local">Local</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="group relative">
                <Label>Temperature</Label>
                <Input type="number" step="0.1" value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                <Tooltip content="Controls randomness: 0 = deterministic, 1 = very random.">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
              <div className="group relative">
                <Label>Top-K</Label>
                <Input type="number" value={form.top_k} onChange={(e) => setForm({ ...form, top_k: e.target.value })} />
                <Tooltip content="Sample from top K tokens only. Lower = more focused.">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
              <div className="group relative">
                <Label>Max Tokens</Label>
                <Input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} />
                <Tooltip content="Maximum response length in tokens.">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="group relative">
                <Label>Context Window</Label>
                <Input type="number" value={form.context_window} onChange={(e) => setForm({ ...form, context_window: e.target.value })} />
                <Tooltip content="Max context window size in tokens (e.g. 128000 for GPT-4o).">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
              <div className="group relative">
                <Label>Resp. Length Limit</Label>
                <Input type="number" value={form.response_length_limit} onChange={(e) => setForm({ ...form, response_length_limit: e.target.value })} />
                <Tooltip content="Hard limit on response token count via EOS biasing.">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
              <div className="group relative">
                <Label>Full Strategy</Label>
                <select value={form.context_full_strategy} onChange={(e) => setForm({ ...form, context_full_strategy: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="truncate">Truncate</option>
                  <option value="summarize">Summarize</option>
                  <option value="fail">Fail</option>
                  <option value="roll_window">Roll Window</option>
                </select>
                <Tooltip content="What happens when the context window fills up.">
                  <HelpCircle className="absolute right-2 top-7 h-3.5 w-3.5 text-muted-foreground/60" />
                </Tooltip>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary" /> Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ Tokenizer config per model ══════════════ */}
      <Dialog open={!!tokenizerOpen} onOpenChange={(v) => { if (!v) setTokenizerOpen(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Tokenizer — {tokenizerForm?.model_name}</DialogTitle></DialogHeader>
          {tokenizerForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Tokenizer name (override)</Label>
                  <Input value={tokenizerForm.tokenizer_name || ""}
                    onChange={(e) => setTokenizerForm({ ...tokenizerForm, tokenizer_name: e.target.value || null })}
                    placeholder="defaults to model name" className="h-8 text-xs font-mono" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs pb-1">
                    <input type="checkbox" checked={tokenizerForm.trust_remote_code}
                      onChange={(e) => setTokenizerForm({ ...tokenizerForm, trust_remote_code: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-input accent-primary" />
                    Trust remote code
                  </label>
                  <label className="flex items-center gap-1.5 text-xs pb-1">
                    <input type="checkbox" checked={tokenizerForm.add_prefix_space}
                      onChange={(e) => setTokenizerForm({ ...tokenizerForm, add_prefix_space: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-input accent-primary" />
                    + Prefix space
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={detectTokens} disabled={detecting} className="h-8 text-xs">
                  <RefreshCw className={`h-3 w-3 mr-1 ${detecting ? "animate-spin" : ""}`} />
                  {detecting ? "Detecting..." : "Detect special tokens"}
                </Button>
              </div>

              {/* Detected tokens */}
              {Object.keys(tokenizerForm.detected_special_tokens).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Detected special tokens</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(tokenizerForm.detected_special_tokens).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
                        {k}: &quot;{v}&quot;
                      </span>
                    ))}
                    {tokenizerForm.detected_special_token_ids.length > 0 && (
                      <span className="inline-flex items-center rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono">
                        IDs: [{tokenizerForm.detected_special_token_ids.slice(0, 10).join(", ")}{tokenizerForm.detected_special_token_ids.length > 10 ? `…` : ""}]
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Custom tokens */}
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Custom special tokens</span>
                <div className="flex flex-wrap gap-1 mb-1">
                  {tokenizerForm.custom_special_tokens.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-mono">
                      &quot;{t}&quot;
                      <button onClick={() => setTokenizerForm((f) => f ? { ...f, custom_special_tokens: f.custom_special_tokens.filter((_, j) => j !== i) } : f)}
                        className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                  {tokenizerForm.custom_special_tokens.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">None yet.</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input value={newCustomToken} onChange={(e) => setNewCustomToken(e.target.value)}
                    placeholder='e.g. &lt;|tool_call|&gt;' className="h-7 text-xs font-mono flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter" && newCustomToken.trim()) { setTokenizerForm((f) => f ? { ...f, custom_special_tokens: [...f.custom_special_tokens, newCustomToken.trim()] } : f); setNewCustomToken(""); } }} />
                  <Button variant="outline" size="sm" onClick={() => { if (newCustomToken.trim() && tokenizerForm) { setTokenizerForm({ ...tokenizerForm, custom_special_tokens: [...tokenizerForm.custom_special_tokens, newCustomToken.trim()] }); setNewCustomToken(""); } }}
                    disabled={!newCustomToken.trim()} className="h-7 text-[10px]">Add</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenizerOpen(null)}>Cancel</Button>
            <Button onClick={saveTokenizer}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
