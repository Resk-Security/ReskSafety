import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Button,
  Input,
  Label,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
  Card,
  CardContent,
} from "@/components/ui";
import { Plus, Trash2, Play, Pencil, Shield, Cpu, Eye } from "lucide-react";
import type { Provider } from "@/lib/types";

const PROVIDER_TYPES = ["openai", "deepseek", "vllm", "ollama", "custom"] as const;

export function Providers() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    provider_type: "openai",
    endpoint: "",
    api_key: "",
    models: "",
    default_model: "gpt-4o-mini",
    stream_supported: true,
    is_active: true,
    input_scanning: false,
    logits_filtering: false,
  });

  const load = () =>
    api.get<Provider[]>("/api/providers").then(setProviders).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      provider_type: "openai",
      endpoint: "",
      api_key: "",
      models: "",
      default_model: "gpt-4o-mini",
      stream_supported: true,
      is_active: true,
      input_scanning: false,
      logits_filtering: false,
    });
    setEditing(null);
  };

  const openEdit = (p: Provider) => {
    setForm({
      name: p.name,
      provider_type: p.provider_type,
      endpoint: p.endpoint,
      api_key: "",
      models: (p.models ?? []).join(", "),
      default_model: p.default_model,
      stream_supported: p.stream_supported,
      is_active: p.is_active,
      input_scanning: p.security_config?.input_scanning ?? false,
      logits_filtering: p.security_config?.logits_filtering ?? false,
    });
    setEditing(p.id);
    setOpen(true);
  };

  const save = async () => {
    const payload: Record<string, any> = {
      name: form.name,
      provider_type: form.provider_type,
      endpoint: form.endpoint,
      api_key: form.api_key || null,
      models: form.models
        ? form.models.split(",").map((s: string) => s.trim()).filter(Boolean)
        : null,
      default_model: form.default_model,
      stream_supported: form.stream_supported,
      is_active: form.is_active,
      security_config: {
        input_scanning: form.input_scanning,
        logits_filtering: form.logits_filtering,
      },
    };
    if (!payload.api_key && !editing) payload.api_key = null;
    if (editing && !payload.api_key) delete (payload as any).api_key;

    if (editing) {
      await api.put(`/api/providers/${editing}`, payload);
    } else {
      await api.post("/api/providers", payload);
    }
    setOpen(false);
    resetForm();
    load();
  };

  const remove = async (id: string) => {
    await api.del(`/api/providers/${id}`);
    load();
  };

  const test = async (id: string) => {
    try {
      const res = await api.post<{ success: boolean; message: string; models_found?: string[] }>(
        `/api/providers/${id}/test`
      );
      if (res.success) {
        const modelList = (res.models_found ?? []).join(", ");
        alert(`OK: ${res.message}\n\nModels: ${modelList || "none listed"}`);
      } else {
        alert(`Failed: ${res.message}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message || e}`);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Providers</h1>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Provider
        </Button>
      </div>

      {providers.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No providers configured. Add one to route LLM calls.
          </CardContent>
        </Card>
      )}

      {providers.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Endpoint</TH>
              <TH>Models</TH>
              <TH>Security</TH>
              <TH>Stream</TH>
              <TH>Active</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {providers.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD>
                  <Badge variant="outline">{p.provider_type}</Badge>
                </TD>
                <TD className="max-w-[200px] truncate font-mono text-xs">
                  {p.endpoint}
                </TD>
                <TD>
                  <Button variant="ghost" size="sm"
                    onClick={() => navigate(`/providers/${p.id}/models`)}
                    className="text-xs gap-1">
                    <Eye className="h-3 w-3" />
                    {p.models?.length ?? 0} models
                  </Button>
                </TD>
                <TD>
                  <div className="flex gap-1">
                    {p.security_config?.input_scanning && (
                      <Badge variant="default" className="text-[10px] gap-0.5">
                        <Shield className="h-3 w-3" /> Scan
                      </Badge>
                    )}
                    {p.security_config?.logits_filtering && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Cpu className="h-3 w-3" /> Logits
                      </Badge>
                    )}
                    {!p.security_config?.input_scanning && !p.security_config?.logits_filtering && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TD>
                <TD>
                  <Badge variant={p.stream_supported ? "default" : "secondary"}>
                    {p.stream_supported ? "yes" : "no"}
                  </Badge>
                </TD>
                <TD>
                  <Badge variant={p.is_active ? "default" : "destructive"}>
                    {p.is_active ? "active" : "inactive"}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => test(p.id)}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Provider" : "New Provider"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. OpenAI Prod"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={form.provider_type}
                  onChange={(e) => setForm({ ...form, provider_type: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Endpoint URL</Label>
              <Input
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <Label>API Key {editing ? "(leave blank to keep current)" : ""}</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Models (comma separated)</Label>
                <Input
                  value={form.models}
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                  placeholder="gpt-4o, gpt-4o-mini"
                />
              </div>
              <div>
                <Label>Default Model</Label>
                <Input
                  value={form.default_model}
                  onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stream"
                  checked={form.stream_supported}
                  onChange={(e) => setForm({ ...form, stream_supported: e.target.checked })}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="stream" className="cursor-pointer">Stream supported</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="active" className="cursor-pointer">Active</Label>
              </div>
            </div>

            <div className="rounded border p-3 space-y-2">
              <span className="text-sm font-medium">Security layers</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox"
                    checked={form.input_scanning}
                    onChange={(e) => setForm({ ...form, input_scanning: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary" />
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Input scanning
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox"
                    checked={form.logits_filtering}
                    onChange={(e) => setForm({ ...form, logits_filtering: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary" />
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  Logits filtering
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}