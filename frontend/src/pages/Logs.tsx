import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LogEntry } from "@/lib/types";
import { Badge, Table, TBody, TD, TH, THead, TR, Input, Select, Card, CardContent, CardHeader, CardTitle, ErrorAlert, Tooltip } from "@/components/ui";
import { History } from "lucide-react";

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

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

type Tab = "requests" | "audit";

export function Logs() {
  const [tab, setTab] = useState<Tab>("requests");
  const [err, setErr] = useState("");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <div className="mt-2 flex gap-4 border-b">
          <Tooltip content="Real-time request logs: every LLM call, its status (success/blocked/error), backend, model, and any blocked phrase.">
            <button
              onClick={() => setTab("requests")}
              className={`pb-2 text-sm font-medium transition-colors ${
                tab === "requests"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Request Logs
            </button>
          </Tooltip>
          <Tooltip content="Audit trail of configuration changes: who modified roles, policies, users, and what changed.">
            <button
              onClick={() => setTab("audit")}
              className={`pb-2 text-sm font-medium transition-colors ${
                tab === "audit"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Audit Log
            </button>
          </Tooltip>
        </div>
      </div>

      <ErrorAlert message={err} />

      {tab === "requests" ? <RequestLogs /> : <AuditLog onError={setErr} />}
    </div>
  );
}

function RequestLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState("");
  const [phrase, setPhrase] = useState("");

  async function load() {
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (phrase) params.set("phrase", phrase);
    try { setLogs(await api.get<LogEntry[]>(`/api/admin/logs?${params}`)); }
    catch { setLogs([]); }
  }
  useEffect(() => { load(); }, [status, phrase]);

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">all statuses</option>
          <option value="success">success</option>
          <option value="blocked">blocked</option>
          <option value="error">error</option>
        </Select>
        <Input placeholder="filter phrase…" value={phrase} onChange={(e) => setPhrase(e.target.value)} className="max-w-xs" />
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Time</TH>
            <TH>Status</TH>
            <TH>Backend</TH>
            <TH>Model</TH>
            <TH>Blocked phrase</TH>
          </TR>
        </THead>
        <TBody>
          {logs.map((l) => (
            <TR key={l.id}>
              <TD className="text-muted-foreground text-xs">{new Date(l.created_at).toLocaleString()}</TD>
              <TD>
                <Badge variant={l.status === "blocked" || l.status === "error" ? "destructive" : "secondary"}>
                  {l.status}
                </Badge>
              </TD>
              <TD>{l.backend_type}</TD>
              <TD className="font-mono text-xs">{l.model || "—"}</TD>
              <TD>{l.blocked_phrase || "—"}</TD>
            </TR>
          ))}
          {!logs.length && (
            <TR><TD colSpan={5} className="text-muted-foreground text-center py-8">No logs.</TD></TR>
          )}
        </TBody>
      </Table>
    </>
  );
}

function AuditLog({ onError }: { onError: (msg: string) => void }) {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    api.get<ChangeLogEntry[]>("/api/admin/changelog?limit=100").then(setLogs).catch(() => {});
  }, []);

  const filtered = filter ? logs.filter((l) => l.entity_type === filter) : logs;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-muted-foreground" />
            {filtered.length} entries
          </CardTitle>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All types</option>
            {[...new Set(logs.map((l) => l.entity_type))].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No changes recorded yet.</div>
        )}
        <div className="space-y-1">
          {filtered.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-md border-b px-2 py-2 text-sm last:border-0 hover:bg-muted/50">
              <Badge className={`shrink-0 text-[10px] font-mono ${ACTION_COLORS[e.action] || ""}`}>
                {e.action}
              </Badge>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{e.actor}</span>{" "}
                {e.summary || (
                  <>
                    changed <strong>{e.entity_type}</strong> {e.entity_id.slice(0, 8)}
                    {e.field ? ` .${e.field}` : ""}
                    {e.old_value ? ` "${e.old_value}"` : ""}
                    {e.new_value ? ` \u2192 "${e.new_value}"` : ""}
                  </>
                )}
              </div>
              <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}