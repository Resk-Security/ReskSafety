import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
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

export function ChangeLog() {
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    api.get<ChangeLogEntry[]>("/api/admin/changelog?limit=100").then(setLogs).catch(() => {});
  }, []);

  const filtered = filter ? logs.filter((l) => l.entity_type === filter) : logs;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Change History</h1>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-muted-foreground" />
            {filtered.length} entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No changes recorded yet.
            </div>
          )}
          <div className="space-y-1">
            {filtered.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-md border-b px-2 py-2 text-sm last:border-0 hover:bg-muted/50">
                <Badge className={`shrink-0 text-[10px] font-mono ${ACTION_COLORS[e.action] || ""}`}>
                  {e.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{e.actor}</span>
                  {" "}
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
    </div>
  );
}