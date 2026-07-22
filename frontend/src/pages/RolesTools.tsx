import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Capability } from "@/lib/types";
import {
  Button, Input, Label, Table, TBody, TD, TH, THead, TR,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  ErrorAlert, Tooltip, Select,
} from "@/components/ui";
import { Plus, Pencil, Trash2, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BIT_OPTIONS = Array.from({ length: 64 }, (_, i) => i);

export function RolesTools() {
  const navigate = useNavigate();
  const [caps, setCaps] = useState<Capability[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [editingBit, setEditingBit] = useState<number | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; bit_position: number }>({
    name: "", description: "", bit_position: 0,
  });

  async function load() {
    try { setCaps(await api.get<Capability[]>("/api/capabilities")); }
    catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    const used = new Set(caps.map((c) => c.bit_position));
    const next = BIT_OPTIONS.find((b) => !used.has(b)) ?? 0;
    setEditingBit(null);
    setForm({ name: "", description: "", bit_position: next });
    setOpen(true);
  }

  function openEdit(c: Capability) {
    setEditingBit(c.bit_position);
    setForm({ name: c.name, description: c.description, bit_position: c.bit_position });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingBit !== null) {
        await api.put(`/api/capabilities/${editingBit}`, {
          name: form.name, description: form.description,
        });
      } else {
        await api.post("/api/capabilities", {
          bit_position: form.bit_position, name: form.name, description: form.description,
        });
      }
      setOpen(false);
      setEditingBit(null);
      load();
    } catch (e) { setErr(String(e)); }
  }

  async function remove(bit: number) {
    if (!confirm("Delete this tool? Roles using it will lose this permission.")) return;
    try { await api.del(`/api/capabilities/${bit}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  const usedBits = new Set(caps.map((c) => c.bit_position));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tools & Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define named capabilities that roles can enable. Each tool is a single permission bit.
            <Tooltip content="Tools are created here, then assigned to roles in the Roles page via toggles.">
              <HelpCircle className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted-foreground/60" />
            </Tooltip>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/roles")}>
            Assign to roles
          </Button>
          <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> New tool</Button>
        </div>
      </div>

      <ErrorAlert message={err} />

      <Table>
        <THead>
          <TR>
            <TH className="w-20">Bit</TH>
            <TH>Name</TH>
            <TH>Description</TH>
            <TH className="w-24">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {caps
            .sort((a, b) => a.bit_position - b.bit_position)
            .map((c) => (
            <TR key={c.bit_position}>
              <TD><span className="font-mono text-xs text-muted-foreground">{c.bit_position}</span></TD>
              <TD className="font-medium">{c.name}</TD>
              <TD className="text-muted-foreground">{c.description || "\u2014"}</TD>
              <TD>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c.bit_position)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
          {caps.length === 0 && (
            <TR><TD colSpan={4} className="text-center py-8 text-muted-foreground">No tools defined yet.</TD></TR>
          )}
        </TBody>
      </Table>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogHeader>
          <DialogTitle>{editingBit !== null ? "Edit tool" : "New tool"}</DialogTitle>
        </DialogHeader>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. web_search" required />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does this permission allow?" />
            </div>
            {editingBit === null && (
              <div className="space-y-1">
                <Label>
                  Required bit
                  <Tooltip content="Each tool needs a unique bit position (0-63). This is the required_bit used in policies.">
                    <HelpCircle className="ml-1 inline h-3 w-3 cursor-help text-muted-foreground/60" />
                  </Tooltip>
                </Label>
                <Select value={form.bit_position}
                  onChange={(e) => setForm({ ...form, bit_position: Number(e.target.value) })}>
                  {BIT_OPTIONS.map((b) => (
                    <option key={b} value={b} disabled={usedBits.has(b) && b !== editingBit}>
                      {b === form.bit_position ? `${b} (recommended)` : usedBits.has(b) ? `${b} (in use)` : b}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </form>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>{editingBit !== null ? "Update" : "Create"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}