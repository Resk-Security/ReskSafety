import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { ArrowLeft, Activity, Cpu, Database, Layers } from "lucide-react";
import type { SessionStats, SessionData } from "@/lib/types";

export function UserSessions() {
  const { userId } = useParams<{ userId: string }>();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (!userId) return;
    api.get<{ username: string }>(`/api/users/${userId}`).then((u: any) => {
      setUserName(u.username || "");
    }).catch(() => {});
    api.get<SessionData[]>(`/api/sessions/user/${userId}?limit=50`).then(setSessions).catch(() => {});
    api.get<SessionStats>(`/api/sessions/user/${userId}/stats`).then(setStats).catch(() => {});
  }, [userId]);

  const chartData = stats?.daily?.slice()?.reverse() || [];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link to="/users">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">
          {userName || "User"} <span className="text-muted-foreground">· Sessions</span>
        </h1>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4" />
              Sessions
            </div>
            <div className="mt-1 text-2xl font-bold">{stats?.total_sessions ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {stats?.active_sessions ?? 0} active, {stats?.completed_sessions ?? 0} completed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="h-4 w-4" />
              Total tokens
            </div>
            <div className="mt-1 text-2xl font-bold">
              {(stats?.total_tokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="h-4 w-4" />
              Unique agents
            </div>
            <div className="mt-1 text-2xl font-bold">{stats?.unique_agents ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="h-4 w-4" />
              Tools
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(stats?.unique_tools ?? []).length > 0
                ? (stats!.unique_tools).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))
                : <span className="text-muted-foreground text-sm">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && <TokensChart data={chartData} />}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>{sessions.length} sessions found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Agent</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Tokens</TH>
                <TH>Tools</TH>
                <TH>Last seen</TH>
              </TR>
            </THead>
            <TBody>
              {sessions.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">{s.agent_id}</TD>
                  <TD>
                    <Badge variant="outline">{s.agent_type}</Badge>
                  </TD>
                  <TD>
                    <Badge
                      variant={
                        s.status === "active"
                          ? "default"
                          : s.status === "completed"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {s.status}
                    </Badge>
                  </TD>
                  <TD>{(s.total_tokens ?? 0).toLocaleString()}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(s.tools_connected ?? []).map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {s.last_seen_at
                      ? new Date(s.last_seen_at).toLocaleDateString()
                      : "—"}
                  </TD>
                </TR>
              ))}
              {!sessions.length && (
                <TR>
                  <TD
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No sessions recorded yet.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TokensChart({ data }: { data: Array<{ date: string; tokens: number; sessions: number }> }) {
  const maxTokens = Math.max(...data.map((d) => d.tokens), 1);
  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);
  const W = 600;
  const H = 180;

  const xStep = data.length > 1 ? W / (data.length - 1) : W / 2;

  function linePath(arr: number[], max: number) {
    return arr
      .map((v, i) => `${i === 0 ? "M" : "L"} ${i * xStep},${H - (v / max) * H * 0.8}`)
      .join(" ");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily activity</CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" preserveAspectRatio="xMidYMid meet">
          <path
            d={linePath(data.map((d) => d.tokens), maxTokens)}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
          />
          <path
            d={linePath(data.map((d) => d.sessions), maxSessions)}
            fill="none"
            stroke="hsl(var(--destructive))"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          {data.map((d, i) => (
            <g key={d.date}>
              <circle cx={i * xStep} cy={H - (d.tokens / maxTokens) * H * 0.8} r="2" fill="hsl(var(--primary))" />
              <text
                x={i * xStep}
                y={H - 4}
                textAnchor="middle"
                className="fill-current text-muted-foreground"
                style={{ fontSize: "10px", opacity: 0.7 }}
              >
                {d.date.slice(5)}
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-primary" /> Tokens
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-destructive" /> Sessions
          </span>
        </div>
      </CardContent>
    </Card>
  );
}