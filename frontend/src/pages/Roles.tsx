import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { McpServer, Policy, Role } from "@/lib/types";
import {
  Button,
  Input,
  Label,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  ErrorAlert,
} from "@/components/ui";
import { fetchCapabilities, clearCapabilitiesCache, type CapabilityCategory } from "@/lib/capabilities";
import {
  Shield,
  Eye,
  SlidersHorizontal,
  Wrench,
  Plus,
  Trash2,
  CheckCircle2,
  FlaskConical,
  History,
  BookOpen,
  Cog,
  X, Star, Globe, HelpCircle, ExternalLink, Server,
} from "lucide-react";

interface RoleFormData {
  name: string;
  description: string;
  capabilities_mask: number;
  policy_ids: string[];
}

interface ChangeLogEntry {
  id: number;
  actor: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  summary: string | null;
  created_at: string;
}

interface CustomPreset {
  name: string;
  mask: number;
  description: string;
}

const PRESETS: Array<{
  key: string;
  mask: number;
  description: string;
  color: string;
  icon: any;
}> = [
  { key: "viewer", mask: 0b00000111, description: "Read-only: tools, code gen, DB reads.", color: "border-teal-500/50 bg-teal-50 dark:bg-teal-950/20", icon: BookOpen },
  { key: "reader", mask: 0b00001111, description: "Viewer + DB write access.", color: "border-green-500/50 bg-green-50 dark:bg-green-950/20", icon: Eye },
  { key: "operator", mask: 0b00011111, description: "Reader + send emails.", color: "border-blue-500/50 bg-blue-50 dark:bg-blue-950/20", icon: Shield },
  { key: "developer", mask: 0b00111111, description: "Operator + access PII data.", color: "border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/20", icon: Cog },
  { key: "architect", mask: 0b01111111, description: "Developer + manage users.", color: "border-orange-500/50 bg-orange-50 dark:bg-orange-950/20", icon: Wrench },
  { key: "root", mask: 0b11111111, description: "All capabilities — unrestricted access.", color: "border-red-500/50 bg-red-50 dark:bg-red-950/20", icon: SlidersHorizontal },
];

const STORAGE_KEY = "resk_custom_presets";

function loadCustomPresets(): CustomPreset[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveCustomPresets(presets: CustomPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

type DetailTab = "capabilities" | "policies" | "preview" | "mcp";

export function Roles() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [roles, setRoles] = useState<Role[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [capabilityCategories, setCapabilityCategories] = useState<CapabilityCategory[]>([]);
  const [err, setErr] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [detailTab, _setDetailTab] = useState<DetailTab>(
    (searchParams.get("tab") as DetailTab) || "capabilities"
  );
  function setDetailTab(tab: DetailTab) {
    _setDetailTab(tab);
    setSearchParams(tab === "capabilities" ? {} : { tab }, { replace: true });
  }
  const [form, setForm] = useState<RoleFormData>({
    name: "", description: "", capabilities_mask: 0, policy_ids: [],
  });
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<ChangeLogEntry[]>([]);
  const [previewText, setPreviewText] = useState("");
  const [previewResult, setPreviewResult] = useState("");
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpToolsMap, setMcpToolsMap] = useState<Record<string, any[]>>({});
  const [mcpAllowlist, setMcpAllowlist] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setRoles(await api.get<Role[]>("/api/roles"));
      setPolicies(await api.get<Policy[]>("/api/policies"));
      setMcpServers(await api.get<McpServer[]>("/api/mcp/servers"));
      clearCapabilitiesCache();
      setCapabilityCategories(await fetchCapabilities());
    } catch (e) { setErr(String(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAudit = async () => {
    try { setAuditLog(await api.get<ChangeLogEntry[]>("/api/admin/changelog?limit=20")); } catch {}
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  useEffect(() => {
    if (detailTab === "mcp" && selectedRole) {
      setMcpAllowlist(selectedRole.mcp_tool_allowlist ?? []);
      mcpServers.forEach(async (srv) => {
        if (!mcpToolsMap[srv.id]) {
          try {
            const res = await api.get<{ tools: any[] }>(`/api/mcp/servers/${srv.id}/tools`);
            setMcpToolsMap((prev) => ({ ...prev, [srv.id]: res.tools }));
          } catch {}
        }
      });
    }
  }, [detailTab, selectedRole?.id]);

  const toggleMcpTool = async (entry: string) => {
    if (!selectedRole) return;
    const updated = mcpAllowlist.includes(entry)
      ? mcpAllowlist.filter((e) => e !== entry)
      : [...mcpAllowlist, entry];
    setMcpAllowlist(updated);
    try {
      await api.put(`/api/roles/${selectedRole.id}`, { mcp_tool_allowlist: updated });
    } catch (e) { setErr(String(e)); }
  };

  const applyPreset = async (mask: number) => {
    if (!selectedRole) return;
    try {
      await api.put(`/api/roles/${selectedRole.id}`, { capabilities_mask: mask, policy_ids: form.policy_ids });
      setForm((f) => ({ ...f, capabilities_mask: mask }));
      load();
    } catch (e) { setErr(String(e)); }
  };

  const saveAsPreset = () => {
    const name = prompt("Name this preset:");
    if (!name) return;
    const updated: CustomPreset[] = [...customPresets, { name, mask: form.capabilities_mask, description: `Custom: ${name}` }];
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const removeCustomPreset = (idx: number) => {
    const updated = customPresets.filter((_, i) => i !== idx);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const toggleBit = async (bit: number) => {
    if (!selectedRole) return;
    const newMask = form.capabilities_mask ^ (1 << bit);
    try {
      await api.put(`/api/roles/${selectedRole.id}`, { capabilities_mask: newMask, policy_ids: form.policy_ids });
      setForm((f) => ({ ...f, capabilities_mask: newMask }));
      load();
    } catch (e) { setErr(String(e)); }
  };

  const togglePolicy = async (pid: string, checked: boolean) => {
    if (!selectedRole) return;
    const newIds = checked ? [...form.policy_ids, pid] : form.policy_ids.filter((p) => p !== pid);
    try {
      await api.put(`/api/roles/${selectedRole.id}`, { capabilities_mask: form.capabilities_mask, policy_ids: newIds });
      setForm((f) => ({ ...f, policy_ids: newIds }));
      load();
    } catch (e) { setErr(String(e)); }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/roles", form);
      setShowNewDialog(false);
      setForm({ name: "", description: "", capabilities_mask: 0, policy_ids: [] });
      load();
    } catch (e) { setErr(String(e)); }
  };

  const removeRole = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      await api.del(`/api/roles/${id}`);
      if (selectedRoleId === id) { setSelectedRoleId(null); setForm({ name: "", description: "", capabilities_mask: 0, policy_ids: [] }); }
      load();
    } catch (e) { setErr(String(e)); }
  };

  const runPreview = async () => {
    if (!selectedRole) return;
    setPreviewResult("Running...");
    try {
      const res = await api.post<any>("/v1/chat/completions", {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: previewText || "Say hello in one sentence." }],
        max_tokens: 80, temperature: 0.7,
      });
      setPreviewResult(res?.choices?.[0]?.message?.content || "(no response)");
    } catch (e: any) { setPreviewResult(`Error: ${e?.message || e}`); }
  };

  const allPresets = [...PRESETS, ...customPresets.map((cp) => ({
    key: cp.name, mask: cp.mask, description: cp.description,
    color: "border-violet-500/50 bg-violet-50 dark:bg-violet-950/20", icon: Star, custom: true,
  }))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Roles</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadAudit(); setShowAudit(!showAudit); }}>
            <History className="mr-1 h-4 w-4" /> Audit Log
          </Button>
          <Button size="sm" onClick={() => setShowNewDialog(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Role
          </Button>
        </div>
      </div>

      <ErrorAlert message={err} />

      {/* ── Preset cards (no binary mask) ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {allPresets.map((preset: any) => {
          const Icon = preset.icon;
          const isActive = selectedRole && form.capabilities_mask === preset.mask;
          return (
            <Card key={preset.key}
              className={`cursor-pointer transition-all hover:shadow-md relative ${
                isActive ? "ring-2 ring-primary " + preset.color : preset.color + " opacity-70 hover:opacity-100"
              }`}
              onClick={() => { if (selectedRole) applyPreset(preset.mask); }}>
              <CardContent className={`pt-3 pb-3 ${!selectedRole ? "pointer-events-none opacity-50" : ""}`}>
                <div className="flex items-start justify-between">
                  <Icon className={`h-5 w-5 ${preset.color.split(" ")[0].replace("border-", "text-")}`} />
                  {isActive && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <div className="mt-1 text-xs font-semibold capitalize">{preset.key}</div>
                <div className="mt-1 text-[10px] text-muted-foreground leading-tight">{preset.description}</div>
                {preset.custom && (
                  <button className="absolute -right-1 -top-1 rounded-full bg-background border p-0.5"
                    onClick={(e) => { e.stopPropagation(); removeCustomPreset(allPresets.indexOf(preset) - PRESETS.length); }}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Main ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          <h2 className="text-sm font-medium text-muted-foreground">Custom Roles</h2>
          {roles.map((r) => {
            const found = PRESETS.find((p) => p.mask === r.capabilities_mask);
            const Icon = found?.icon || Cog;
            return (
              <Card key={r.id}
                className={`cursor-pointer transition-all hover:shadow-sm ${selectedRoleId === r.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => { setSelectedRoleId(r.id); setForm({ name: r.name, description: r.description || "", capabilities_mask: r.capabilities_mask, policy_ids: [] }); setDetailTab("capabilities"); }}>
                <CardContent className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.description || "\u2014"}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); removeRole(r.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {roles.length === 0 && <div className="text-xs text-muted-foreground">No custom roles yet.</div>}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selectedRole ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Select a role from the list or create a new one to configure permissions.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold">{selectedRole.name}</div>
                <Tooltip content="Save current capabilities as a reusable preset card above.">
                  <Button variant="ghost" size="sm" onClick={saveAsPreset}>
                    <Star className="h-4 w-4" /> Save as preset
                  </Button>
                </Tooltip>
              </div>

              {/* ── Detail tabs ── */}
              <div className="flex gap-4 border-b">
                {(["capabilities", "policies", "mcp", "preview"] as DetailTab[]).map((t) => (
                  <button key={t} onClick={() => setDetailTab(t)}
                    className={`pb-2 text-sm font-medium capitalize transition-colors ${
                      detailTab === t
                        ? "border-b-2 border-primary text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {t === "capabilities" ? "Tools & Permissions" : t}
                  </button>
                ))}
              </div>

              {detailTab === "capabilities" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                  {capabilityCategories.map((cat) => {
                    const CatIcon = cat.icon;
                    return (
                      <Card key={cat.id}>
                        <CardHeader className="pb-1.5">
                          <CardTitle className="flex items-center gap-2 text-sm font-medium">
                            <CatIcon className={`h-4 w-4 ${cat.color}`} />
                            {cat.label}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {cat.bits.map((b) => {
                            const enabled = !!(form.capabilities_mask & (1 << b.bit));
                            return (
                              <label key={b.bit} className="flex cursor-pointer items-start gap-2 text-sm">
                                <input type="checkbox" checked={enabled} onChange={() => toggleBit(b.bit)}
                                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0" />
                                <span className={enabled ? "" : "text-muted-foreground"}>{b.label}</span>
                                <Tooltip content={b.desc}>
                                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                </Tooltip>
                              </label>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {detailTab === "policies" && (
                <Card>
                  <CardHeader className="pb-1.5">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Tooltip content="Content filtering policies attached to this role. Each policy defines banned phrases, biased tokens, and tool whitelists.">
                        <span className="underline decoration-dotted underline-offset-4 cursor-help">Policies</span>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {policies.map((p) => {
                        const checked = form.policy_ids.includes(p.id);
                        return (
                          <Tooltip key={p.id} content={p.description || p.name}>
                            <Badge variant={checked ? "default" : "outline"} className="cursor-pointer text-xs"
                              onClick={() => togglePolicy(p.id, !checked)}>
                              {checked ? "\u2713 " : ""}{p.name}
                            </Badge>
                          </Tooltip>
                        );
                      })}
                      {policies.length === 0 && <div className="text-xs text-muted-foreground">No policies yet.</div>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {detailTab === "mcp" && (
                <Card>
                  <CardHeader className="pb-1.5">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <Tooltip content="Allow specific MCP tools for this role. Format: server_id:tool_name">
                        <span className="underline decoration-dotted underline-offset-4 cursor-help">MCP Tools</span>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {mcpServers.length === 0 && <p className="text-xs text-muted-foreground">No MCP servers configured. Add one in Integrations &gt; MCP Servers.</p>}
                    {mcpServers.map((srv) => {
                      const tools = mcpToolsMap[srv.id] ?? [];
                      return (
                        <div key={srv.id} className="mb-4">
                          <div className="text-sm font-medium mb-1">{srv.name}</div>
                          {tools.length === 0 && <p className="text-xs text-muted-foreground">Loading tools...</p>}
                          {tools.map((t: any, i: number) => {
                            const name = t.name ?? t.function?.name ?? `tool_${i}`;
                            const entry = `${srv.id}:${name}`;
                            const checked = mcpAllowlist.includes(entry);
                            return (
                              <label key={entry} className="flex cursor-pointer items-start gap-2 text-sm py-0.5">
                                <input type="checkbox" checked={checked}
                                  onChange={() => toggleMcpTool(entry)}
                                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0" />
                                <div>
                                  <span>{name}</span>
                                  {t.description && <p className="text-[10px] text-muted-foreground">{t.description}</p>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                    {mcpAllowlist.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {mcpAllowlist.map((e) => (
                          <Badge key={e} variant="outline" className="text-[10px]">{e.split(":")[1] || e}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {detailTab === "preview" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <FlaskConical className="h-4 w-4 text-muted-foreground" />
                      Test — "{selectedRole.name}" configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Input placeholder="Type a test prompt..." value={previewText}
                        onChange={(e) => setPreviewText(e.target.value)} className="flex-1" />
                      <Button size="sm" onClick={runPreview}>
                        <FlaskConical className="mr-1 h-4 w-4" /> Run Test
                      </Button>
                    </div>
                    {previewResult && (
                      <div className="mt-3 rounded-md border bg-muted/50 p-3 text-sm">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">Response:</div>
                        <div className="whitespace-pre-wrap">{previewResult}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Audit log ── */}
      {showAudit && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" /> Change History
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto">
            {auditLog.length === 0 && <div className="text-xs text-muted-foreground">No changes recorded yet.</div>}
            {auditLog.map((e) => (
              <div key={e.id} className="flex items-start gap-2 border-b py-1.5 text-xs last:border-0">
                <Badge variant="outline" className="shrink-0 text-[10px]">{e.action}</Badge>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{e.actor}</span>{" "}
                  {e.summary || `${e.entity_type} ${e.field || ""} ${e.old_value || ""} \u2192 ${e.new_value || ""}`}
                </div>
                <div className="shrink-0 text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── New Role Dialog ── */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>New Custom Role</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createRole} className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Developer" required />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this role for?" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
                  <Button type="submit">Create</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}