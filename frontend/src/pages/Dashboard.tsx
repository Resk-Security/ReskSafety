import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import type { Stats, Policy, PolicyConfig, GlobalSettings } from "@/lib/types";
import { Button, ErrorAlert } from "@/components/ui";
import { ForceGraph, GraphLegend } from "@/components/ForceGraph";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Shield, Search, Lock, BrainCircuit, AlertTriangle,
  FileText, CheckCircle2, XCircle, ArrowRight, Cpu, FlaskConical, Eye, Globe,
} from "lucide-react";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const chartColors = {
  success: "hsl(142, 71%, 45%)",
  blocked: "hsl(0, 84%, 60%)",
  error: "hsl(35, 92%, 55%)",
};

interface LayerInfo {
  key: string;
  label: string;
  icon: any;
  side: "input" | "output";
  getStatus: (policies: Policy[], configs: PolicyConfig[]) => { enabled: boolean; detail: string };
  navTo: string;
}

const SECURITY_LAYERS: LayerInfo[] = [
  {
    key: "scanning_pipeline", label: "Scanning Pipeline", icon: AlertTriangle, side: "input",
    navTo: "/policies/scanning-pipeline",
    getStatus: (policies) => {
      const count = policies.filter((p) => p.scanning_pipeline_config_id || p.scanning_pipeline?.block_categories?.length).length;
      const cats = policies.reduce((s, p) => s + (p.scanning_pipeline?.block_categories?.length ?? 0), 0);
      return { enabled: count > 0, detail: `${count} polic${count > 1 ? "ies" : "y"} · ${cats} gates total` };
    },
  },
  {
    key: "semantic_detection", label: "Semantic Detection", icon: Search, side: "input",
    navTo: "/policies/semantic-detection",
    getStatus: (policies, configs) => {
      const count = policies.filter((p) => p.semantic_detection_config_id || p.semantic_detection?.enabled).length;
      const cfg = configs.filter((c) => c.config_type === "semantic_detection").length;
      return { enabled: count > 0, detail: `${count} polic${count > 1 ? "ies" : "y"} · ${cfg} saved configs` };
    },
  },
  {
    key: "classifiers", label: "Classifiers", icon: BrainCircuit, side: "input",
    navTo: "/policies/classifiers",
    getStatus: (policies, configs) => {
      const count = policies.filter((p) => p.classifiers_config_id || p.classifiers?.enabled).length;
      const cfg = configs.filter((c) => c.config_type === "classifiers").length;
      return { enabled: count > 0, detail: `${count} polic${count > 1 ? "ies" : "y"} · ${cfg} saved configs` };
    },
  },
  {
    key: "rules", label: "Phrase Rules", icon: FileText, side: "input",
    navTo: "/policies/rules",
    getStatus: (policies) => {
      const count = policies.reduce((s, p) => s + (p.rules?.length ?? 0), 0);
      return { enabled: count > 0, detail: `${count} rule${count > 1 ? "s" : ""} across all policies` };
    },
  },
  {
    key: "logits_filtering", label: "Logits Filtering", icon: Eye, side: "input",
    navTo: "/policies/classifiers",
    getStatus: (policies) => {
      const count = policies.filter((p) => p.classifiers?.shadow_penalty != null).length;
      return { enabled: count > 0, detail: `${count} polic${count > 1 ? "ies" : "y"} active` };
    },
  },
  {
    key: "providers_scanning", label: "Providers Scanning", icon: Globe, side: "input",
    navTo: "/providers",
    getStatus: (_policies, _configs) => {
      return { enabled: false, detail: "not configured" };
    },
  },
  {
    key: "access_control", label: "Access Control", icon: Lock, side: "output",
    navTo: "/policies/access-control",
    getStatus: (policies, configs) => {
      const count = policies.filter((p) => p.access_control_config_id || p.access_control?.enabled).length;
      const cfg = configs.filter((c) => c.config_type === "access_control").length;
      return { enabled: count > 0, detail: `${count} polic${count > 1 ? "ies" : "y"} · ${cfg} saved configs` };
    },
  },
  {
    key: "observability", label: "Observability", icon: Shield, side: "output",
    navTo: "/observability",
    getStatus: (_policies, _configs) => {
      return { enabled: false, detail: "no config found" };
    },
  },
];

function testInput(text: string, layers: LayerInfo[], policies: Policy[], configs: PolicyConfig[], disabled: Set<string>): { layer: LayerInfo; detail: string }[] {
  const results: { layer: LayerInfo; detail: string }[] = [];
  for (const layer of layers) {
    if (disabled.has(layer.key)) continue;
    const { enabled } = layer.getStatus(policies, configs);
    if (!enabled) continue;
    results.push({ layer, detail: "layer active (test logic placeholder)" });
  }
  return results;
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyConfigs, setPolicyConfigs] = useState<PolicyConfig[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);

  const [disabledLayers, setDisabledLayers] = useState<Set<string>>(new Set());
  const [popupLayer, setPopupLayer] = useState<LayerInfo | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResults, setTestResults] = useState<{ layer: LayerInfo; detail: string }[]>([]);

  useEffect(() => {
    api.get<Stats>("/api/admin/stats").then(setStats).catch((e) => setErr(String(e)));
    api.get<{ nodes: any[]; links: any[] }>("/api/admin/graph").then(setGraphData).catch(() => {});
    api.get<Policy[]>("/api/policies").then(setPolicies).catch(() => {});
    api.get<PolicyConfig[]>("/api/policy-configs").then(setPolicyConfigs).catch(() => {});
    api.get<GlobalSettings>("/api/settings/global").then(setGlobalSettings).catch(() => {});
  }, []);

  if (!user) return <Navigate to="/login" replace />;

  function toggleLayer(key: string) {
    setDisabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function runTest() {
    if (!testText) { setTestResults([]); return; }
    setTestResults(testInput(testText, SECURITY_LAYERS, policies, policyConfigs, disabledLayers));
  }

  const doughnutData = stats ? {
    labels: ["Success", "Blocked", "Error"],
    datasets: [{
      data: [stats.success_requests, stats.blocked_requests, stats.error_requests],
      backgroundColor: [chartColors.success, chartColors.blocked, chartColors.error],
      borderWidth: 0,
    }],
  } : null;

  const rulesData = stats && Object.keys(stats.by_rule).length ? {
    labels: Object.keys(stats.by_rule).slice(0, 10),
    datasets: [{
      label: "Blocked",
      data: Object.values(stats.by_rule).slice(0, 10),
      backgroundColor: chartColors.blocked,
    }],
  } : null;

  const usersData = stats && Object.keys(stats.by_user).length ? {
    labels: Object.keys(stats.by_user).slice(0, 10),
    datasets: [{
      label: "Requests",
      data: Object.values(stats.by_user).slice(0, 10),
      backgroundColor: chartColors.success,
    }],
  } : null;

  const inputLayers = SECURITY_LAYERS.filter((l) => l.side === "input");
  const outputLayers = SECURITY_LAYERS.filter((l) => l.side === "output");
  const inputActivePolicies = policies.filter((p) =>
    p.scanning_pipeline_config_id || p.scanning_pipeline?.block_categories?.length ||
    p.semantic_detection_config_id || p.semantic_detection?.enabled ||
    p.classifiers_config_id || p.classifiers?.enabled ||
    p.rules?.length
  ).length;
  const outputActivePolicies = policies.filter((p) =>
    p.access_control_config_id || p.access_control?.enabled
  ).length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <ErrorAlert message={err} />

      {/* ── Security flow ── */}
      <Card className="mb-6">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <div>
            <CardTitle>Security Pipeline</CardTitle>
            <CardDescription>{policies.length} polic{policies.length > 1 ? "ies" : "y"} loaded</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowTest(true); setTestResults([]); setTestText(""); }}>
              <FlaskConical className="h-3.5 w-3.5 mr-1" /> Test
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex items-center justify-center gap-0">
            <div className="shrink-0 flex flex-col items-center gap-0.5 rounded-md border bg-primary/10 border-primary/20 px-2 py-2 w-20 text-center">
              <span className="text-[10px] font-bold text-primary">INPUT</span>
            </div>
            {inputLayers.map((layer) => {
              const disabled = disabledLayers.has(layer.key);
              const { enabled } = layer.getStatus(policies, policyConfigs);
              return (
                <div key={layer.key} className="flex items-center gap-0">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />
                  <div
                    onClick={() => setPopupLayer(layer)}
                    className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 w-[108px] text-center transition-colors cursor-pointer ${
                      disabled
                        ? "bg-muted/20 text-muted-foreground/30 border-muted-foreground/10 opacity-40"
                        : enabled
                          ? "bg-green-500/5 text-green-600 border-green-300 dark:border-green-700 hover:bg-green-500/10"
                          : "bg-muted/40 text-muted-foreground/40 border-muted-foreground/20 hover:bg-muted/60"
                    }`}
                  >
                    <div className="inline-flex items-center gap-1">
                      <layer.icon className={`h-3.5 w-3.5 ${disabled ? "text-muted-foreground/20" : enabled ? "text-green-500" : "text-muted-foreground/30"}`} />
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLayer(layer.key); }}
                        className={`text-[8px] px-0.5 rounded border leading-none ${
                          disabled ? "bg-red-500/10 text-red-400 border-red-300/30" : "bg-transparent text-muted-foreground/40 border-transparent hover:border-muted-foreground/20"
                        }`}
                        title={disabled ? "Enable" : "Disable"}
                      >⏻</button>
                    </div>
                    <span className={`text-[9px] font-semibold leading-tight ${disabled ? "text-muted-foreground/20" : ""}`}>{layer.label}</span>
                    <span className={`text-[8px] leading-tight ${disabled ? "text-muted-foreground/20" : enabled ? "text-green-500/70" : "text-muted-foreground/30"}`}>
                      {disabled ? "disabled" : enabled ? "✓ active" : "✗ off"}
                    </span>
                  </div>
                </div>
              );
            })}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />
            <div className="shrink-0 flex flex-col items-center gap-0.5 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/30 px-2 py-2 w-20 text-center">
              <Cpu className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-semibold leading-tight text-violet-600 dark:text-violet-400">MODEL</span>
            </div>
            {outputLayers.map((layer) => {
              const disabled = disabledLayers.has(layer.key);
              const { enabled } = layer.getStatus(policies, policyConfigs);
              return (
                <div key={layer.key} className="flex items-center gap-0">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />
                  <div
                    onClick={() => setPopupLayer(layer)}
                    className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 w-[108px] text-center transition-colors cursor-pointer ${
                      disabled
                        ? "bg-muted/20 text-muted-foreground/30 border-muted-foreground/10 opacity-40"
                        : enabled
                          ? "bg-green-500/5 text-green-600 border-green-300 dark:border-green-700 hover:bg-green-500/10"
                          : "bg-muted/40 text-muted-foreground/40 border-muted-foreground/20 hover:bg-muted/60"
                    }`}
                  >
                    <div className="inline-flex items-center gap-1">
                      <layer.icon className={`h-3.5 w-3.5 ${disabled ? "text-muted-foreground/20" : enabled ? "text-green-500" : "text-muted-foreground/30"}`} />
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLayer(layer.key); }}
                        className={`text-[8px] px-0.5 rounded border leading-none ${
                          disabled ? "bg-red-500/10 text-red-400 border-red-300/30" : "bg-transparent text-muted-foreground/40 border-transparent hover:border-muted-foreground/20"
                        }`}
                        title={disabled ? "Enable" : "Disable"}
                      >⏻</button>
                    </div>
                    <span className={`text-[9px] font-semibold leading-tight ${disabled ? "text-muted-foreground/20" : ""}`}>{layer.label}</span>
                    <span className={`text-[8px] leading-tight ${disabled ? "text-muted-foreground/20" : enabled ? "text-green-500/70" : "text-muted-foreground/30"}`}>
                      {disabled ? "disabled" : enabled ? "✓ active" : "✗ off"}
                    </span>
                  </div>
                </div>
              );
            })}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5 shrink-0" />
            <div className="shrink-0 flex flex-col items-center gap-0.5 rounded-md border bg-muted-foreground/10 border-muted-foreground/20 px-2 py-2 w-20 text-center">
              <span className="text-[10px] font-bold text-muted-foreground">OUTPUT</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Layer detail popup ── */}
      {popupLayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPopupLayer(null)}>
          <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <popupLayer.icon className="h-6 w-6 text-green-500" />
              <div>
                <h2 className="text-base font-semibold">{popupLayer.label}</h2>
                <p className="text-xs text-muted-foreground">{popupLayer.side === "input" ? "Input security layer" : "Output security layer"}</p>
              </div>
            </div>
            {(() => {
              const { enabled, detail } = popupLayer.getStatus(policies, policyConfigs);
              const spConfigs = policyConfigs.filter((c) => c.config_type === "scanning_pipeline");
              const sdConfigs = policyConfigs.filter((c) => c.config_type === "semantic_detection");
              const cfConfigs = policyConfigs.filter((c) => c.config_type === "classifiers");
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {enabled ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                    <span className={enabled ? "" : "text-muted-foreground/60"}>{enabled ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{detail}</p>

                  {/* ── Scanning Pipeline params ── */}
                  {popupLayer.key === "scanning_pipeline" && spConfigs.length > 0 && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      {spConfigs.slice(0, 3).map((cfg) => {
                        const c = cfg.config as any;
                        return (
                          <div key={cfg.id} className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                            <span className="font-medium">{cfg.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">confidence ≥</span>
                              <span className="font-mono">{c.min_confidence_threshold?.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">block score ≥</span>
                              <span className="font-mono">{c.block_score_threshold?.toFixed(1)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                {c.block_on_first_threat ? "⏹ block on first" : "▶ continue on match"}
                              </span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{c.block_categories?.length ?? 0} categories</span>
                            </div>
                          </div>
                        );
                      })}
                      {spConfigs.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{spConfigs.length - 3} more configs</p>
                      )}
                    </div>
                  )}

                  {/* ── Semantic Detection params ── */}
                  {popupLayer.key === "semantic_detection" && sdConfigs.length > 0 && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      {sdConfigs.slice(0, 3).map((cfg) => {
                        const c = cfg.config as any;
                        return (
                          <div key={cfg.id} className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                            <span className="font-medium">{cfg.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">backend</span>
                              <span className="font-mono">{c.backend}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">similarity ≥</span>
                              <span className="font-mono">{c.threshold?.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{c.attack_patterns?.length ?? 0} patterns</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{c.block_categories?.length ?? 0} categories</span>
                            </div>
                          </div>
                        );
                      })}
                      {sdConfigs.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{sdConfigs.length - 3} more configs</p>
                      )}
                    </div>
                  )}

                  {/* ── Classifiers params ── */}
                  {popupLayer.key === "classifiers" && cfConfigs.length > 0 && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      {cfConfigs.slice(0, 3).map((cfg) => {
                        const c = cfg.config as any;
                        return (
                          <div key={cfg.id} className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                            <span className="font-medium">{cfg.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{c.rules?.length ?? 0} rules</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">shadow_penalty</span>
                              <span className="font-mono">{c.shadow_penalty}</span>
                            </div>
                            {c.multi_level?.enabled && (
                              <span className="text-[10px] text-muted-foreground">multi-level penalties on</span>
                            )}
                          </div>
                        );
                      })}
                      {cfConfigs.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{cfConfigs.length - 3} more configs</p>
                      )}
                    </div>
                  )}

                  {/* ── Logits Filtering params ── */}
                  {popupLayer.key === "logits_filtering" && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      {(() => {
                        const penalties = new Set(policies.map((p) => p.classifiers?.shadow_penalty).filter(Boolean));
                        const multi = policies.some((p) => p.classifiers?.multi_level?.enabled);
                        return (
                          <div className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">shadow_penalty</span>
                              <span className="font-mono">{penalties.size > 0 ? [...penalties].join(", ") : "-"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">multi-level</span>
                              <span>{multi ? "on" : "off"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">policies using logits</span>
                              <span>{policies.filter((p) => p.classifiers?.shadow_penalty != null).length}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Phrase Rules params ── */}
                  {popupLayer.key === "rules" && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      <div className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">total rules across policies</span>
                          <span className="font-medium">{policies.reduce((s, p) => s + (p.rules?.length ?? 0), 0)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">policies with rules</span>
                          <span className="font-medium">{policies.filter((p) => (p.rules?.length ?? 0) > 0).length}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Access Control params ── */}
                  {popupLayer.key === "access_control" && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      <div className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">policies with ACL</span>
                          <span className="font-medium">{policies.filter((p) => p.access_control_config_id || p.access_control?.enabled).length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">saved configs</span>
                          <span className="font-medium">{policyConfigs.filter((c) => c.config_type === "access_control").length}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Global Settings params ── */}
                  {(popupLayer.key === "providers_scanning" || popupLayer.key === "scanning_pipeline") && globalSettings && (
                    <div className="space-y-1.5 border-t pt-2 mt-2">
                      <div className="rounded bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                        <span className="font-medium">Global scan settings</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">fail_open</span>
                          <span className={globalSettings.scanning.fail_open ? "text-amber-500" : ""}>
                            {globalSettings.scanning.fail_open ? "✓ yes" : "✗ no"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">enable_caching</span>
                          <span className={globalSettings.scanning.enable_caching ? "text-green-500" : "text-muted-foreground/50"}>
                            {globalSettings.scanning.enable_caching ? "✓ on" : "✗ off"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">max_input_length</span>
                          <span className="font-mono">{globalSettings.scanning.max_input_length.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">languages</span>
                          <span className="font-mono text-[10px]">{globalSettings.scanning.languages.join(", ")}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setPopupLayer(null); navigate(popupLayer.navTo); }}>
                      Configure
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPopupLayer(null)}>Close</Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Test modal ── */}
      {showTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowTest(false)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-3">
              <h2 className="text-base font-semibold">Test security layers</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Type input text and see which active layers respond.</p>
              {disabledLayers.size > 0 && (
                <p className="text-xs text-amber-500 mt-1">{disabledLayers.size} layer{disabledLayers.size > 1 ? "s" : ""} disabled in pipeline</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Paste or type a prompt to test…"
                rows={5}
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm font-mono resize-none"
              />
              <Button onClick={runTest} size="sm" className="w-full">
                <FlaskConical className="h-3.5 w-3.5 mr-1" /> Run test
              </Button>
              {testResults.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-destructive">{testResults.length} layer{testResults.length > 1 ? "s" : ""} triggered</p>
                  {testResults.map((r, i) => (
                    <div key={i} className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs space-y-0.5">
                      <r.layer.icon className="h-3.5 w-3.5 inline mr-1 text-destructive" />
                      <span className="font-medium">{r.layer.label}</span>
                      <span className="text-muted-foreground"> — {r.detail}</span>
                    </div>
                  ))}
                </div>
              )}
              {testResults.length === 0 && testText && (
                <p className="text-xs text-green-500 text-center">No layers triggered.</p>
              )}
            </div>
            <div className="border-t px-5 py-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowTest(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats grid ── */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total requests</div>
            <div className="mt-1 text-3xl font-bold">{stats?.total_requests ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Blocked</div>
            <div className="mt-1 text-3xl font-bold text-destructive">{stats?.blocked_requests ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Success</div>
            <div className="mt-1 text-3xl font-bold">{stats?.success_requests ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Blocked ratio</div>
            <div className="mt-1 text-3xl font-bold">{stats ? `${(stats.blocked_ratio * 100).toFixed(1)}%` : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ── */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {doughnutData && (
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <div className="w-80">
                <Doughnut data={doughnutData} options={{ cutout: "55%", plugins: { legend: { position: "bottom" } } }} />
              </div>
            </CardContent>
          </Card>
        )}
        {rulesData && (
          <Card>
            <CardHeader>
              <CardTitle>Top Blocked Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <Bar data={rulesData} options={{
                indexAxis: "y" as const,
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
              }} />
            </CardContent>
          </Card>
        )}
        {usersData && (
          <Card>
            <CardHeader>
              <CardTitle>Requests by User</CardTitle>
            </CardHeader>
            <CardContent>
              <Bar data={usersData} options={{
                indexAxis: "y" as const,
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
              }} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Security Posture ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Security Posture</CardTitle>
          <CardDescription>
            {policies.length} polic{policies.length > 1 ? "ies" : "y"} · {policyConfigs.length} saved configs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3
                onClick={() => navigate("/policies")}
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors"
              >
                <span className="h-px flex-1 bg-border" />
                Input Security
                <span className="h-px flex-1 bg-border" />
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">{inputActivePolicies} polic{inputActivePolicies > 1 ? "ies" : "y"} active</p>
              <div className="space-y-2">
                {inputLayers.map((layer) => {
                  const { enabled, detail } = layer.getStatus(policies, policyConfigs);
                  return (
                    <div key={layer.key} className="flex items-center gap-3 rounded border px-4 py-3">
                      {enabled
                        ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                        : <XCircle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                      }
                      <layer.icon className={`h-4 w-4 shrink-0 ${enabled ? "text-green-600" : "text-muted-foreground/40"}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${enabled ? "" : "text-muted-foreground/50"}`}>
                          {layer.label}
                        </span>
                        <p className="text-xs text-muted-foreground truncate">{detail}</p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${
                        enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground/50"
                      }`}>
                        {enabled ? "active" : "off"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3
                onClick={() => navigate("/policies")}
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors"
              >
                <span className="h-px flex-1 bg-border" />
                Output Security
                <span className="h-px flex-1 bg-border" />
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">{outputActivePolicies} polic{outputActivePolicies > 1 ? "ies" : "y"} active</p>
              <div className="space-y-2">
                {outputLayers.map((layer) => {
                  const { enabled, detail } = layer.getStatus(policies, policyConfigs);
                  return (
                    <div key={layer.key} className="flex items-center gap-3 rounded border px-4 py-3">
                      {enabled
                        ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                        : <XCircle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                      }
                      <layer.icon className={`h-4 w-4 shrink-0 ${enabled ? "text-green-600" : "text-muted-foreground/40"}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${enabled ? "" : "text-muted-foreground/50"}`}>
                          {layer.label}
                        </span>
                        <p className="text-xs text-muted-foreground truncate">{detail}</p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${
                        enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground/50"
                      }`}>
                        {enabled ? "active" : "off"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {graphData && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Network Graph</CardTitle>
            <CardDescription>{graphData.nodes.length} nodes · {graphData.links.length} connections</CardDescription>
          </CardHeader>
          <CardContent>
            <ForceGraph nodes={graphData.nodes} links={graphData.links} />
            <GraphLegend />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
