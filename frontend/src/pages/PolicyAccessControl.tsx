import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyConfig, AccessControlConfig, AclNode } from "@/lib/types";
import {
  Button, Input, ErrorAlert, Tooltip,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Save, ArrowLeft, FileJson, ChevronRight, ChevronDown } from "lucide-react";

const ACTIONS = ["allow", "deny", "warn", "block"];

/* ── Templates ── */

interface AclTemplate {
  name: string;
  description: string;
  root: AclNode;
}

const ACL_TEMPLATES: AclTemplate[] = [
  {
    name: "Admin full access",
    description: "Simple admin-only access.",
    root: {
      condition: "user_role",
      branches: {
        admin: { action: "allow" },
        default: { action: "deny", reason: "Access denied: admin role required" },
      },
    },
  },
  {
    name: "Agent read-only",
    description: "Agents can only read.",
    root: {
      condition: "user_role",
      branches: {
        agent: {
          condition: "request_type",
          branches: {
            read: { action: "allow" },
            default: { action: "deny", reason: "Write access denied" },
          },
        },
        default: { action: "deny", reason: "Access denied" },
      },
    },
  },
  {
    name: "Multi-role RBAC",
    description: "Full RBAC with admin, agent, user, and guest roles.",
    root: {
      condition: "user_role",
      branches: {
        admin: { action: "allow" },
        agent: {
          condition: "request_type",
          branches: {
            read: { action: "allow" },
            write: { action: "warn", reason: "Agent write requires review" },
            default: { action: "deny", reason: "Unknown request type" },
          },
        },
        user: { action: "deny", reason: "User access not permitted" },
        guest: { action: "warn", reason: "Guest access — all actions logged" },
        default: { action: "deny", reason: "Unrecognized role" },
      },
    },
  },
];

/* ── Helpers ── */

function defaultAclConfig(): AccessControlConfig {
  return { enabled: true, root: null };
}

function emptyForm() {
  return { name: "", description: "", config: defaultAclConfig() };
}

/* ── Component ── */

export function PolicyAccessControl() {
  const [configs, setConfigs] = useState<PolicyConfig[]>([]);
  const [editing, setEditing] = useState<PolicyConfig | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; config: AccessControlConfig }>(emptyForm());
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      setConfigs(await api.get<PolicyConfig[]>(`/api/policy-configs?type=access_control`));
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setCollapsed({});
  }

  function startEdit(c: PolicyConfig) {
    setEditing(c);
    setForm({ name: c.name, description: c.description, config: c.config as AccessControlConfig });
    setCollapsed({});
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm());
    setErr("");
  }

  async function save() {
    if (!form.name) { setErr("Name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      if (editing) {
        await api.put(`/api/policy-configs/${editing.id}`, {
          name: form.name, description: form.description, config: form.config,
        });
      } else {
        await api.post("/api/policy-configs", {
          name: form.name, description: form.description, config_type: "access_control", config: form.config,
        });
      }
      cancelEdit();
      load();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function remove(c: PolicyConfig) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api.del(`/api/policy-configs/${c.id}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  function updateRoot(node: AclNode | null) {
    setForm((f) => ({ ...f, config: { ...f.config, root: node } }));
  }

  function toggleCollapse(path: string) {
    setCollapsed((c) => ({ ...c, [path]: !c[path] }));
  }

  function loadTemplate(t: AclTemplate) {
    setForm((f) => ({ ...f, config: { ...f.config, root: t.root, enabled: true } }));
    setCollapsed({});
  }

  /* ── Editor mode ── */
  if (editing !== undefined) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={cancelEdit}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="text-2xl font-semibold">{editing ? `Edit: ${editing.name}` : "New access control config"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Role-based access control via decision tree.</p>
            </div>
          </div>
          <Button onClick={save} disabled={saving || !form.name}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </div>

        <ErrorAlert message={err} />

        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Admin-only RBAC" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this ACL controls" />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
              <input type="checkbox" checked={form.config.enabled}
                onChange={(e) => setForm({ ...form, config: { ...form.config, enabled: e.target.checked } })}
                className="peer sr-only" />
              <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-4" />
            </label>
            <span className="font-medium text-sm">Enable access control</span>
            <Tooltip content="Enforce RBAC via ACL decision tree at every request">
              <span className="text-muted-foreground/60 cursor-help text-xs">[?]</span>
            </Tooltip>
          </div>

          {/* ── How it works ── */}
          <div className="rounded border p-3 space-y-2 bg-muted/20">
            <span className="text-sm font-medium">How it works</span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The ACL decision tree evaluates each request by traversing nodes based on <strong>context keys</strong>
              (e.g. <code>user_role</code>, <code>request_type</code>, <code>data_classification</code>).
            </p>
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Start at the root node — evaluate <code>user_role</code></li>
                <li>Match the role value against named branches</li>
                <li>If the matched branch is a decision node, evaluate its condition</li>
                <li>Continue until a terminal node is reached, then apply its action</li>
                <li>If no branch matches, the <code>default</code> branch is used</li>
              </ol>
            </div>
          </div>

          {/* ── Templates ── */}
          <div className="rounded border p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <FileJson className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">ACL templates</span>
            </div>
            <p className="text-xs text-muted-foreground">Start from a pre-built template.</p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {ACL_TEMPLATES.map((t, i) => (
                <div key={i} onClick={() => loadTemplate(t)}
                  className="cursor-pointer rounded border p-2 hover:bg-accent transition-colors">
                  <span className="text-xs font-medium">{t.name}</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Decision tree editor ── */}
          <div className={`space-y-4 ${form.config.enabled ? "" : "pointer-events-none opacity-40"}`}>
            <div className="rounded border p-4 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Decision tree</span>
                <Button variant="outline" size="sm" onClick={() => {
                  const key = prompt("Branch name (e.g. manager):");
                  if (key && form.config.root) {
                    const u = addBranchRec(form.config.root, "", key);
                    if (u) updateRoot(u);
                  } else if (key) {
                    updateRoot({ condition: "user_role", branches: { [key]: { action: "allow" } } });
                  }
                }}>
                  <Plus className="h-3 w-3 mr-1" /> Add root branch
                </Button>
              </div>
              {form.config.root && (
                <AclTreeEditorV2
                  node={form.config.root} path="" collapsed={collapsed}
                  onToggle={toggleCollapse}
                  onUpdate={(patch) => { const u = updateNodeRec(form.config.root!, "", patch); if (u) updateRoot(u); }}
                  onAddBranch={(parentPath) => {
                    const key = prompt("Branch name:");
                    if (key) { const u = addBranchRec(form.config.root!, parentPath, key); if (u) updateRoot(u); }
                  }}
                  onRemoveBranch={(branchPath, branchKey) => {
                    const u = removeBranchRec(form.config.root!, branchPath, branchKey);
                    if (u) updateRoot(u);
                  }}
                />
              )}
              {!form.config.root && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">No ACL tree defined. Use a template above or add a root node manually.</p>
                  <Button variant="outline" size="sm" onClick={() => updateRoot({ action: "allow" })}>
                    <Plus className="h-3 w-3 mr-1" /> Add root node
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── List mode ── */
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Access Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable ACL configs. Create, edit, and later attach them to policies.
          </p>
        </div>
        <Button onClick={startCreate}><Plus className="mr-1 h-4 w-4" /> New config</Button>
      </div>

      <ErrorAlert message={err} />

      {configs.length === 0 ? (
        <div className="rounded border p-8 text-center">
          <FileJson className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No access control configs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create a decision tree to define role-based access. Then attach it to a policy.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={startCreate}>
            <Plus className="h-3 w-3 mr-1" /> Create your first config
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((c) => (
            <div key={c.id} className="rounded border p-3 flex items-center justify-between hover:bg-accent/30 transition-colors">
              <div>
                <span className="text-sm font-medium">{c.name}</span>
                <p className="text-xs text-muted-foreground">{c.description || "\u2014"}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {(c.config as AccessControlConfig).root?.condition || "terminal"} root
                  </span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {c.config.root ? "tree defined" : "no tree"}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tree helpers ── */

function updateNodeRec(node: AclNode, path: string, patch: Partial<AclNode>): AclNode | null {
  const keys = path.split(".").filter(Boolean);
  if (keys.length === 0) return { ...node, ...patch };
  const branch = { ...node.branches };
  if (branch[keys[0]]) branch[keys[0]] = updateNodeRec(branch[keys[0]], keys.slice(1).join("."), patch)!;
  return { ...node, branches: branch };
}

function addBranchRec(node: AclNode, path: string, key: string): AclNode | null {
  if (path === "") return { ...node, branches: { ...(node.branches || {}), [key]: { action: "allow" } } };
  const parts = path.split(".").filter(Boolean);
  if (!node.branches || !node.branches[parts[0]]) return null;
  const sub = addBranchRec(node.branches[parts[0]], parts.slice(1).join("."), key);
  return sub ? { ...node, branches: { ...node.branches, [parts[0]]: sub } } : null;
}

function removeBranchRec(node: AclNode, path: string, key: string): AclNode | null {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    const b = { ...node.branches };
    delete b[key];
    return { ...node, branches: b };
  }
  if (!node.branches || !node.branches[parts[0]]) return null;
  const sub = removeBranchRec(node.branches[parts[0]], parts.slice(1).join("."), key);
  return sub ? { ...node, branches: { ...node.branches, [parts[0]]: sub } } : null;
}

/* ── ACL Tree Editor ── */

function AclTreeEditorV2({
  node, path, collapsed, onToggle, onUpdate, onAddBranch, onRemoveBranch, depth = 0,
}: {
  node: AclNode; path: string; collapsed: Record<string, boolean>;
  onToggle: (p: string) => void; onUpdate: (patch: Partial<AclNode>) => void;
  onAddBranch: (parentPath: string) => void; onRemoveBranch: (bp: string, bk: string) => void;
  depth?: number;
}) {
  const isCollapsed = collapsed[path] ?? false;
  const isDecision = !!node.condition;
  const hasBranches = node.branches && Object.keys(node.branches).length > 0;

  return (
    <div className="space-y-1" style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div className={`flex items-center gap-2 rounded p-2 ${depth > 0 ? "border-l-2 border-muted hover:border-primary/30" : ""}`}>
        {hasBranches && (
          <button onClick={() => onToggle(path)} className="text-muted-foreground hover:text-foreground">
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          {isDecision && (
            <>
              <span className="text-xs font-medium text-muted-foreground">condition:</span>
              <Input value={node.condition || ""} onChange={(e) => onUpdate({ condition: e.target.value || null })} className="h-7 w-40 text-xs font-mono" />
            </>
          )}
          {!isDecision && (
            <>
              <span className="text-xs font-medium text-muted-foreground">action:</span>
              <select value={node.action || "allow"} onChange={(e) => onUpdate({ action: e.target.value })}
                className="h-7 rounded border border-input bg-background px-2 text-xs font-mono">
                {ACTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
              <span className="text-xs font-medium text-muted-foreground ml-1">reason:</span>
              <Input value={node.reason || ""} onChange={(e) => onUpdate({ reason: e.target.value || null })} className="h-7 w-60 text-xs" placeholder="Optional reason" />
            </>
          )}
        </div>
        {hasBranches && (
          <button onClick={() => onAddBranch(path)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0" title="Add branch">
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {!isCollapsed && hasBranches && node.branches && (
        <div className="space-y-1">
          {Object.entries(node.branches).map(([key, child]) => (
            <div key={key} className="group flex items-start">
              <div className="flex items-center gap-1 mt-2 mr-1">
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{key}</span>
                <button onClick={() => onRemoveBranch(path, key)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1">
                <AclTreeEditorV2
                  node={child} path={path ? `${path}.${key}` : key}
                  collapsed={collapsed} onToggle={onToggle}
                  onUpdate={(patch) => onUpdate({ branches: { ...node.branches!, [key]: { ...child, ...patch } } } as any)}
                  onAddBranch={onAddBranch} onRemoveBranch={onRemoveBranch} depth={depth + 1}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
