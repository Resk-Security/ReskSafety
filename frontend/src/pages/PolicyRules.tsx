import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyRule } from "@/lib/types";
import {
  Button, Input, Select, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  ErrorAlert,
} from "@/components/ui";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const EMPTY_RULE = (): PolicyRule => ({
  name: "", description: "", rule_type: "contains", phrases: [""], mode: "hard", penalty: 10,
});

export function PolicyRules() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PolicyRule | null>(null);
  const [form, setForm] = useState<PolicyRule>(EMPTY_RULE());

  async function load() {
    try {
      setRules(await api.get<PolicyRule[]>("/api/policy-rules"));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("404")) {
        setErr("API endpoint /api/policy-rules not found. Make sure the backend server is running on port 8000.");
      } else {
        setErr(msg);
      }
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_RULE());
    setOpen(true);
  }

  function openEdit(r: PolicyRule) {
    setEditing(r);
    setForm({ ...r });
    setOpen(true);
  }

  async function submit() {
    try {
      if (editing?.id) {
        await api.put(`/api/policy-rules/${editing.id}`, form);
      } else {
        await api.post("/api/policy-rules", form);
      }
      setOpen(false);
      load();
    } catch (e) { setErr(String(e)); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    try { await api.del(`/api/policy-rules/${id}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Named, atomic rules that define phrase-level blocking or biasing.
            Rules can be reused across multiple policies.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New rule
        </Button>
      </div>

      <ErrorAlert message={err} />

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Description</TH>
            <TH className="w-20">Type</TH>
            <TH className="w-20">Mode</TH>
            <TH className="w-16">Phrases</TH>
            <TH className="w-24">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rules.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{r.name}</TD>
              <TD className="text-muted-foreground max-w-xs truncate">{r.description || "\u2014"}</TD>
              <TD><span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{r.rule_type}</span></TD>
              <TD><span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{r.mode}</span></TD>
              <TD className="text-xs text-muted-foreground">{(r.phrases || []).length}</TD>
              <TD>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => r.id && remove(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
          {rules.length === 0 && (
            <TR><TD colSpan={6} className="text-center py-8 text-muted-foreground">No rules yet.</TD></TR>
          )}
        </TBody>
      </Table>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <DialogContent className="sm:max-w-lg">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Block SQL injection" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Description</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What does this block?" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phrases</label>
              <div className="space-y-1.5">
                {form.phrases.map((p, idx) => (
                  <div key={idx} className="flex gap-1.5 items-center">
                    <Input value={p}
                      onChange={(e) => {
                        const next = [...form.phrases];
                        next[idx] = e.target.value;
                        setForm({ ...form, phrases: next });
                      }}
                      placeholder="phrase to match…"
                      className="flex-1" />
                    {form.phrases.length > 1 && (
                      <button onClick={() => setForm({ ...form, phrases: form.phrases.filter((_, i) => i !== idx) })}
                        className="text-muted-foreground hover:text-destructive p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, phrases: [...form.phrases, ""] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add phrase
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <Select value={form.rule_type}
                  onChange={(e) => setForm({ ...form, rule_type: e.target.value as PolicyRule["rule_type"] })}>
                  <option value="contains">contains</option>
                  <option value="exact">exact</option>
                  <option value="startswith">startswith</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Mode</label>
                <Select value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value as PolicyRule["mode"] })}>
                  <option value="hard">hard</option>
                  <option value="bias">bias</option>
                </Select>
              </div>
              {form.mode === "bias" && (
                <div className="space-y-1 w-20">
                  <label className="text-xs font-medium">Penalty</label>
                  <Input type="number" step="0.5" value={form.penalty}
                    onChange={(e) => setForm({ ...form, penalty: parseFloat(e.target.value) || 0 })} />
                </div>
              )}
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>{editing ? "Update" : "Create"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
