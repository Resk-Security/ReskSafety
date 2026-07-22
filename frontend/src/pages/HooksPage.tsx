import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Button, Input, Label, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Badge, Card, CardContent, ErrorAlert,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Play, Terminal } from "lucide-react";
import type { Hook, HookResult } from "@/lib/types";

export function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [testResult, setTestResult] = useState<HookResult | null>(null);

  const [form, setForm] = useState({
    name: "", hook_type: "before_tool", command: "",
    timeout_sec: 30, action: "block", is_active: true,
  });

  const load = () =>
    api.get<Hook[]>("/api/hooks").then(setHooks).catch(() => {});

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: "", hook_type: "before_tool", command: "",
      timeout_sec: 30, action: "block", is_active: true });
    setEditing(null);
  };

  const openEdit = (h: Hook) => {
    setForm({ name: h.name, hook_type: h.hook_type, command: h.command,
      timeout_sec: h.timeout_sec, action: h.action, is_active: h.is_active });
    setEditing(h.id);
    setOpen(true);
  };

  const save = async () => {
    setErr("");
    try {
      if (editing) {
        await api.put(`/api/hooks/${editing}`, form);
      } else {
        await api.post("/api/hooks", form);
      }
      setOpen(false);
      resetForm();
      load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
  };

  const remove = async (id: string) => {
    await api.del(`/api/hooks/${id}`);
    load();
  };

  const testHook = async (id: string) => {
    setTestResult(null);
    try {
      const res = await api.post<HookResult>(`/api/hooks/${id}/test`);
      setTestResult(res);
    } catch (e: any) {
      setErr(e?.message || "Test failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lifecycle Hooks</h1>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Hook
        </Button>
      </div>

      <ErrorAlert message={err} />

      {hooks.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          No lifecycle hooks defined. Hooks run before/after tool calls or on errors.
        </CardContent></Card>
      )}

      {hooks.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Action</TH>
              <TH>Timeout</TH>
              <TH>Active</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {hooks.map((h) => (
              <TR key={h.id}>
                <TD className="font-medium">{h.name}</TD>
                <TD><Badge variant="outline">{h.hook_type}</Badge></TD>
                <TD><Badge variant={h.action === "block" ? "destructive" : "secondary"}>{h.action}</Badge></TD>
                <TD className="font-mono text-xs">{h.timeout_sec}s</TD>
                <TD><Badge variant={h.is_active ? "default" : "secondary"}>{h.is_active ? "active" : "inactive"}</Badge></TD>
                <TD>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => testHook(h.id)} title="Test hook">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(h)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(h.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {testResult && (
        <div className="mt-4 rounded border p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="h-4 w-4" />
            <span className="text-sm font-medium">Test Result: {testResult.hook_name}</span>
            <Badge variant={testResult.allowed ? "default" : "destructive"}>
              {testResult.allowed ? "ALLOWED" : "BLOCKED"}
            </Badge>
          </div>
          {testResult.stdout && <pre className="text-xs bg-background p-2 rounded mb-1 overflow-auto max-h-24"><code>{testResult.stdout}</code></pre>}
          {testResult.stderr && <pre className="text-xs bg-destructive/10 p-2 rounded mb-1 overflow-auto max-h-24"><code>{testResult.stderr}</code></pre>}
          {testResult.error && <p className="text-xs text-destructive">{testResult.error}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setTestResult(null)}>Dismiss</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Hook" : "New Hook"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="block-rm-rf" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <select value={form.hook_type} onChange={(e) => setForm({ ...form, hook_type: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="before_tool">Before Tool</option>
                  <option value="after_tool">After Tool</option>
                  <option value="on_error">On Error</option>
                </select>
              </div>
              <div>
                <Label>Action</Label>
                <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="block">Block</option>
                  <option value="audit">Audit</option>
                  <option value="alert">Alert</option>
                </select>
              </div>
            </div>
            <div><Label>Command</Label>
              <textarea value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="echo 'checking...' && exit 0"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Timeout (sec, 1-300)</Label><Input type="number" min={1} max={300} value={form.timeout_sec} onChange={(e) => setForm({ ...form, timeout_sec: parseInt(e.target.value) || 30 })} /></div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary" /> Active
                </label>
              </div>
            </div>
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
