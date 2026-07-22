import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Button, Input, Label, Select, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Badge, Card, CardContent,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Shield, Cpu, AlertTriangle } from "lucide-react";
import type { ModelEntity, ModelSecurityInfo, Provider } from "@/lib/types";

export function ModelsPage() {
  const [models, setModels] = useState<ModelEntity[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [secInfo, setSecInfo] = useState<ModelSecurityInfo | null>(null);
  const [secModelId, setSecModelId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", provider_id: "", type: "remote", temperature: "", top_k: "",
    max_tokens: "", context_window: "", response_length_limit: "",
    context_full_strategy: "truncate", is_active: true,
  });

  const load = () => {
    api.get<ModelEntity[]>("/api/models").then(setModels).catch(() => {});
    api.get<Provider[]>("/api/providers").then(setProviders).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: "", provider_id: "", type: "remote", temperature: "", top_k: "",
      max_tokens: "", context_window: "", response_length_limit: "",
      context_full_strategy: "truncate", is_active: true });
    setEditing(null);
  };

  const openEdit = (m: ModelEntity) => {
    setForm({
      name: m.name, provider_id: m.provider_id ?? "", type: m.type,
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
    const payload: Record<string, any> = {
      name: form.name,
      type: form.type,
      context_full_strategy: form.context_full_strategy,
      is_active: form.is_active,
    };
    if (form.provider_id) payload.provider_id = form.provider_id;
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
  };

  const remove = async (id: string) => {
    await api.del(`/api/models/${id}`);
    load();
  };

  const showSecurity = async (id: string) => {
    try {
      const info = await api.get<ModelSecurityInfo>(`/api/models/${id}/security`);
      setSecInfo(info);
      setSecModelId(id);
    } catch { setSecInfo(null); }
  };

  const provName = (pid: string | null) => providers.find(p => p.id === pid)?.name ?? "—";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Models</h1>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Model
        </Button>
      </div>

      {models.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          No models configured. Models can be created manually or synced from providers.
        </CardContent></Card>
      )}

      {models.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Provider</TH>
              <TH>Type</TH>
              <TH>Temp</TH>
              <TH>Context</TH>
              <TH>Strategy</TH>
              <TH>Active</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {models.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD className="text-xs text-muted-foreground">{provName(m.provider_id)}</TD>
                <TD><Badge variant="outline">{m.type}</Badge></TD>
                <TD className="font-mono text-xs">{m.temperature ?? "—"}</TD>
                <TD className="font-mono text-xs">{m.context_window ? `${(m.context_window / 1000).toFixed(0)}k` : "—"}</TD>
                <TD><Badge variant="secondary">{m.context_full_strategy}</Badge></TD>
                <TD><Badge variant={m.is_active ? "default" : "destructive"}>{m.is_active ? "active" : "inactive"}</Badge></TD>
                <TD>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => showSecurity(m.id)}>
                      <Shield className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
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
            <div>
              <Label>Provider</Label>
              <select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="">None</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Temperature</Label><Input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} /></div>
              <div><Label>Top-K</Label><Input type="number" value={form.top_k} onChange={(e) => setForm({ ...form, top_k: e.target.value })} /></div>
              <div><Label>Max Tokens</Label><Input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Context Window</Label><Input type="number" value={form.context_window} onChange={(e) => setForm({ ...form, context_window: e.target.value })} /></div>
              <div><Label>Resp. Length Limit</Label><Input type="number" value={form.response_length_limit} onChange={(e) => setForm({ ...form, response_length_limit: e.target.value })} /></div>
              <div>
                <Label>Full Strategy</Label>
                <select value={form.context_full_strategy} onChange={(e) => setForm({ ...form, context_full_strategy: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="truncate">Truncate</option>
                  <option value="summarize">Summarize</option>
                  <option value="fail">Fail</option>
                  <option value="roll_window">Roll Window</option>
                </select>
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

      {secInfo && (
        <Dialog open={!!secInfo} onOpenChange={(v) => { if (!v) { setSecInfo(null); setSecModelId(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Security — {secInfo.model_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Attached Policies ({secInfo.policies.length})</h4>
                {secInfo.policies.length === 0 && <p className="text-sm text-muted-foreground">No policies attached</p>}
                {secInfo.policies.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-xs">{p.policy_id.slice(0, 8)}...</span>
                    {p.hook_id && <Badge variant="outline" className="text-[10px]">hook</Badge>}
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Lifecycle Hooks ({secInfo.hooks.length})</h4>
                {secInfo.hooks.length === 0 && <p className="text-sm text-muted-foreground">No hooks attached</p>}
                {secInfo.hooks.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1">
                    <Cpu className="h-3.5 w-3.5 text-secondary" />
                    <span>{h.name}</span>
                    <Badge variant="outline" className="text-[10px]">{h.type}</Badge>
                    <Badge variant={h.action === "block" ? "destructive" : "secondary"} className="text-[10px]">{h.action}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSecInfo(null); setSecModelId(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
