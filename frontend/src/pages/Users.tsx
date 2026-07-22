import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Role, User, Policy } from "@/lib/types";
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
  ErrorAlert,
  Tooltip,
} from "@/components/ui";
import { Plus, Activity, Pencil, Link as LinkIcon, Check } from "lucide-react";

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "", email: "", password: "",
    is_admin: false, role_ids: [] as string[], policy_ids: [] as string[],
  });

  async function load() {
    try {
      setUsers(await api.get<any[]>("/api/users"));
      setRoles(await api.get<Role[]>("/api/roles"));
      setPolicies(await api.get<Policy[]>("/api/policies"));
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ username: "", email: "", password: "", is_admin: false, role_ids: [], policy_ids: [] });
    setOpen(true);
  }

  function openEdit(u: any) {
    setEditingId(u.id);
    setForm({
      username: u.username, email: u.email, password: "", is_admin: u.is_admin,
      role_ids: (u.roles || []).map((r: any) => r.id), policy_ids: [],
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        const payload: any = { username: form.username, email: form.email, is_admin: form.is_admin, role_ids: form.role_ids };
        if (form.password) payload.password = form.password;
        await api.put(`/api/users/${editingId}`, payload);
      } else {
        await api.post("/api/users", form);
      }
      setOpen(false);
      load();
    } catch (e) { setErr(String(e)); }
  }

  async function remove(id: string) {
    if (!confirm("Delete user?")) return;
    try { await api.del(`/api/users/${id}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  function toggleRole(rid: string, checked: boolean) {
    setForm((f) => ({ ...f, role_ids: checked ? [...f.role_ids, rid] : f.role_ids.filter((r) => r !== rid) }));
  }

  function togglePolicy(pid: string, checked: boolean) {
    setForm((f) => ({ ...f, policy_ids: checked ? [...f.policy_ids, pid] : f.policy_ids.filter((p) => p !== pid) }));
  }

  async function copyLink(userId: string) {
    const link = `${window.location.origin}/api/sessions/user/${userId}/stats`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* fallback */ }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> New user</Button>
      </div>

      <ErrorAlert message={err} />

      <Table>
        <THead>
          <TR>
            <TH>Username</TH>
            <TH>Email</TH>
            <TH>Admin</TH>
            <TH>Roles</TH>
            <TH>Sessions</TH>
            <TH>Tokens</TH>
            <TH>Provider Link</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u: any) => (
            <TR key={u.id}>
              <TD className="font-medium">{u.username}</TD>
              <TD>{u.email}</TD>
              <TD>{u.is_admin ? "yes" : "no"}</TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {(u.roles || []).map((r: any) => (
                    <Badge key={r.id} variant="outline" className="text-xs">{r.name}</Badge>
                  ))}
                </div>
              </TD>
              <TD><Badge variant="secondary">{u.session_count ?? 0}</Badge></TD>
              <TD className="font-mono text-xs">{(u.total_tokens ?? 0).toLocaleString()}</TD>
              <TD>
                <Tooltip content="Copy stats tracking URL for this user">
                  <Button variant="ghost" size="sm" onClick={() => copyLink(u.id)}
                    className="font-mono text-xs gap-1 max-w-[160px]">
                    {copiedId === u.id ? (
                      <><Check className="h-3 w-3 text-green-500" /> Copied</>
                    ) : (
                      <><LinkIcon className="h-3 w-3" /> {u.id.slice(0, 8)}…</>
                    )}
                  </Button>
                </Tooltip>
              </TD>
              <TD>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                  <Link to={`/users/${u.id}/sessions`}>
                    <Button variant="ghost" size="sm"><Activity className="h-4 w-4" /></Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}>Delete</Button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit User" : "New User"}</DialogTitle>
        </DialogHeader>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Password {editingId ? "(leave blank to keep current)" : ""}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={editingId ? 0 : 8} required={!editingId} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_admin}
                onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary" />
              Admin
            </label>
            <div className="space-y-1">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => {
                  const checked = form.role_ids.includes(r.id);
                  return (
                    <Tooltip key={r.id} content={r.description || ""}>
                      <Badge variant={checked ? "default" : "outline"} className="cursor-pointer text-xs"
                        onClick={() => toggleRole(r.id, !checked)}>
                        {checked ? "\u2713 " : ""}{r.name}
                      </Badge>
                    </Tooltip>
                  );
                })}
                {roles.length === 0 && <div className="text-xs text-muted-foreground">No roles yet.</div>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Policies</Label>
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
            </div>
          </form>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit}>{editingId ? "Update" : "Create"}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}