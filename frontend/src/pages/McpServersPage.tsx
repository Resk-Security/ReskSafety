import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Button, Input, Label, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Badge, Card, CardContent, ErrorAlert,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Play, Globe } from "lucide-react";
import type { McpServer, McpToolResult } from "@/lib/types";

export function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [tools, setTools] = useState<any[] | null>(null);
  const [toolsServerId, setToolsServerId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", endpoint: "", auth_type: "none", api_key: "",
    trust_level: "sandboxed", allowed_tools: "", is_active: true,
  });

  const load = () =>
    api.get<McpServer[]>("/api/mcp/servers").then(setServers).catch(() => {});

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: "", endpoint: "", auth_type: "none", api_key: "",
      trust_level: "sandboxed", allowed_tools: "", is_active: true });
    setEditing(null);
  };

  const openEdit = (s: McpServer) => {
    setForm({
      name: s.name, endpoint: s.endpoint, auth_type: s.auth_type, api_key: "",
      trust_level: s.trust_level, allowed_tools: (s.allowed_tools ?? []).join(", "), is_active: s.is_active,
    });
    setEditing(s.id);
    setOpen(true);
  };

  const save = async () => {
    setErr("");
    try {
      const payload: Record<string, any> = {
        name: form.name, endpoint: form.endpoint, auth_type: form.auth_type,
        trust_level: form.trust_level, is_active: form.is_active,
      };
      if (form.api_key) payload.api_key = form.api_key;
      if (form.allowed_tools.trim()) {
        payload.allowed_tools = form.allowed_tools.split(",").map(s => s.trim()).filter(Boolean);
      }
      if (editing) {
        await api.put(`/api/mcp/servers/${editing}`, payload);
      } else {
        await api.post("/api/mcp/servers", payload);
      }
      setOpen(false);
      resetForm();
      load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
  };

  const remove = async (id: string) => {
    await api.del(`/api/mcp/servers/${id}`);
    load();
  };

  const testConn = async (id: string) => {
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/api/mcp/servers/${id}/test`);
      alert(res.success ? `OK: ${res.message}` : `Failed: ${res.message}`);
    } catch (e: any) { alert(`Error: ${e?.message || e}`); }
  };

  const showTools = async (id: string) => {
    try {
      const res = await api.get<{ server_id: string; server_name: string; tools: any[] }>(`/api/mcp/servers/${id}/tools`);
      setTools(res.tools);
      setToolsServerId(id);
    } catch { setTools([]); }
  };

  const trustBadge = (level: string) => {
    const v = level === "trusted" ? "default" : level === "sandboxed" ? "secondary" : "destructive" as const;
    return <Badge variant={v}>{level}</Badge>;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">MCP Servers</h1>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Server
        </Button>
      </div>

      <ErrorAlert message={err} />

      {servers.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          No MCP servers configured. Add servers to expose tools for agents.
        </CardContent></Card>
      )}

      {servers.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Endpoint</TH>
              <TH>Trust</TH>
              <TH>Tools</TH>
              <TH>Active</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {servers.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="max-w-[200px] truncate font-mono text-xs">{s.endpoint}</TD>
                <TD>{trustBadge(s.trust_level)}</TD>
                <TD>
                  <Button variant="ghost" size="sm" onClick={() => showTools(s.id)} className="text-xs gap-1">
                    <Globe className="h-3 w-3" />
                    {s.allowed_tools?.length ?? "?"} tools
                  </Button>
                </TD>
                <TD><Badge variant={s.is_active ? "default" : "destructive"}>{s.is_active ? "active" : "inactive"}</Badge></TD>
                <TD>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => testConn(s.id)} title="Test connection">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {tools !== null && (
        <Dialog open={!!tools} onOpenChange={(v) => { if (!v) { setTools(null); setToolsServerId(null); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Tools — {servers.find(s => s.id === toolsServerId)?.name ?? ""}</DialogTitle></DialogHeader>
            {tools.length === 0 && <p className="text-sm text-muted-foreground">No tools exposed or server unreachable.</p>}
            {tools.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-auto">
                {tools.map((t: any, i: number) => (
                  <div key={i} className="rounded border p-2 text-sm">
                    <div className="font-medium">{t.name ?? t.function?.name ?? `tool_${i}`}</div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                    {t.input_schema && <pre className="text-[10px] mt-1 bg-muted p-1 rounded overflow-auto max-h-20"><code>{JSON.stringify(t.input_schema, null, 1)}</code></pre>}
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTools(null); setToolsServerId(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit MCP Server" : "New MCP Server"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My MCP Server" /></div>
              <div>
                <Label>Auth Type</Label>
                <select value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="header">X-API-Key Header</option>
                </select>
              </div>
            </div>
            <div><Label>Endpoint URL</Label><Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="http://localhost:3000" /></div>
            <div><Label>API Key</Label><Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editing ? "(leave blank to keep)" : ""} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Trust Level</Label>
                <select value={form.trust_level} onChange={(e) => setForm({ ...form, trust_level: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="trusted">Trusted — full access</option>
                  <option value="sandboxed">Sandboxed — restricted</option>
                  <option value="untrusted">Untrusted — minimal</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary" /> Active
                </label>
              </div>
            </div>
            <div><Label>Allowed Tools (comma separated, leave empty for all)</Label><Input value={form.allowed_tools} onChange={(e) => setForm({ ...form, allowed_tools: e.target.value })} placeholder="read_file, search, write" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
