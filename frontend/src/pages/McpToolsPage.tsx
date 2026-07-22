import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { McpServer, Role } from "@/lib/types";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Tooltip, ErrorAlert } from "@/components/ui";
import { Server, Wrench, Shield, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";

export function McpToolsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [toolsMap, setToolsMap] = useState<Record<string, any[]>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [srv, rls] = await Promise.all([
        api.get<McpServer[]>("/api/mcp/servers"),
        api.get<Role[]>("/api/roles"),
      ]);
      setServers(srv);
      setRoles(rls);
      for (const s of srv) {
        try {
          const res = await api.get<{ tools: any[] }>(`/api/mcp/servers/${s.id}/tools`);
          setToolsMap((prev) => ({ ...prev, [s.id]: res.tools }));
        } catch {}
      }
    } catch (e) { setErr(String(e)); }
  }

  useEffect(() => { load(); }, []);

  function toggleServer(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isToolAllowed(serverId: string, toolName: string): Role[] {
    const entry = `${serverId}:${toolName}`;
    return roles.filter((r) => (r.mcp_tool_allowlist ?? []).includes(entry));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">MCP Tools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse tools exposed by MCP servers and see which roles have access.
          </p>
        </div>
      </div>

      <ErrorAlert message={err} />

      {servers.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No MCP servers configured. <Button variant="link" className="p-0 h-auto text-sm" onClick={() => window.location.href = "/integrations/mcp"}>Add one</Button>.
          </CardContent>
        </Card>
      )}

      {servers.map((srv) => {
        const open = expanded[srv.id] ?? true;
        const tools = toolsMap[srv.id] ?? [];
        return (
          <Card key={srv.id}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleServer(srv.id)}>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Server className="h-4 w-4 text-muted-foreground" />
                {srv.name}
                <Badge variant="outline" className="text-[10px] ml-1">{srv.trust_level}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{tools.length} tool{tools.length > 1 ? "s" : ""}</span>
              </CardTitle>
            </CardHeader>
            {open && (
              <CardContent>
                {tools.length === 0 && <p className="text-xs text-muted-foreground">No tools available or loading...</p>}
                {tools.map((t: any, i: number) => {
                  const name = t.name ?? t.function?.name ?? `tool_${i}`;
                  const allowedRoles = isToolAllowed(srv.id, name);
                  return (
                    <div key={name} className="flex items-start gap-3 border-b py-2 last:border-0">
                      <Wrench className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{name}</div>
                        {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                        {t.input_schema?.properties && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.keys(t.input_schema.properties).slice(0, 4).map((k) => (
                              <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                            ))}
                            {Object.keys(t.input_schema.properties).length > 4 && (
                              <span className="text-[10px] text-muted-foreground">+{Object.keys(t.input_schema.properties).length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] text-muted-foreground mb-1">Allowed roles</div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {allowedRoles.length === 0 && <span className="text-[10px] text-muted-foreground/50">none</span>}
                          {allowedRoles.slice(0, 3).map((r) => (
                            <Badge key={r.id} variant="secondary" className="text-[10px]">{r.name}</Badge>
                          ))}
                          {allowedRoles.length > 3 && <span className="text-[10px] text-muted-foreground">+{allowedRoles.length - 3}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
