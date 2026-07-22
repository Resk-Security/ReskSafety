import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SecurityConfig } from "@/lib/types";
import {
  Button, Input, Label, Badge, ErrorAlert,
} from "@/components/ui";
import {
  Save, Upload, HelpCircle, Plus, Trash2,
} from "lucide-react";

type SamplingRule = { action: string; rate: number };
type PlatformKey = "console" | "file" | "webhook" | "prometheus" | "datadog";

const INITIAL_CONFIG: SecurityConfig = {
  scanning: {
    enabled: false, fail_open: false, block_on_first_threat: true,
    min_confidence_threshold: 0.3, block_score_threshold: 5.0,
    severity_weights: { info: 0, low: 1, medium: 3, high: 7, critical: 10 },
    languages: ["en", "fr"], max_input_length: 100000, enable_caching: true,
  },
  logits: {
    enabled: false, device: "cpu", shadow_penalty: -15.0,
    multi_level: { enabled: false, penalties: { high: -20.0, medium: -10.0, low: -5.0 } },
    hot_reload_interval: 60,
  },
  observability: {
    enabled: false, environment: "development",
    masking: { enabled: true, sensitive_fields: ["api_key", "password", "token", "secret", "authorization"] },
    sampling: { default_rate: 1.0, rules: [] },
    buffering: { max_size: 1000, flush_interval: 5.0 },
    platforms: {
      console: { enabled: true, format: "human" },
      file: { enabled: false, path: "/var/log/resk/agent_actions.jsonl" },
      webhook: { enabled: false, url: "", headers: {} },
      prometheus: { enabled: false, pushgateway_url: "http://localhost:9091", job_name: "resk" },
      datadog: { enabled: false, api_key: "", site: "datadoghq.com", tags: "" },
    },
  },
};

export function Observability() {
  const [config, setConfig] = useState<SecurityConfig>(INITIAL_CONFIG);
  const [origConfig, setOrigConfig] = useState<string>("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SecurityConfig>("/api/admin/observability/config")
      .then((c) => {
        const merged = { ...INITIAL_CONFIG, ...c };
        setConfig(merged);
        setOrigConfig(JSON.stringify(merged));
      })
      .catch((e) => setErr(String(e)));
  }, []);

  const isDirty = JSON.stringify(config) !== origConfig;

  async function save() {
    setSaving(true);
    try {
      const res = await api.put<SecurityConfig>("/api/admin/observability/config", config);
      setConfig(res);
      setOrigConfig(JSON.stringify(res));
      setErr("");
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  function updateObs<K extends keyof SecurityConfig["observability"]>(k: K, v: SecurityConfig["observability"][K]) {
    setConfig((c) => ({ ...c, observability: { ...c.observability, [k]: v } }));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Observability</h1>
        <Button onClick={save} disabled={saving || !isDirty}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <ErrorAlert message={err} />

      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <label className="relative inline-flex h-5 w-9 cursor-pointer items-center">
            <input type="checkbox" checked={config.observability.enabled}
              onChange={(e) => updateObs("enabled", e.target.checked)}
              className="peer sr-only" />
            <span className="absolute inset-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-4" />
          </label>
          <span className="font-medium text-sm">Enable observability</span>
          <Tooltip content="Send telemetry to configured platforms via ReskPoints">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
          </Tooltip>
        </div>

        <div className={`space-y-5 transition-opacity duration-300 ${config.observability.enabled ? "" : "pointer-events-none opacity-40"}`}>
            <div className="space-y-1">
              <Label>Environment</Label>
              <select value={config.observability.environment}
                onChange={(e) => updateObs("environment", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
              <p className="text-xs text-muted-foreground">Tag all telemetry with this environment label for multi-environment deployments.</p>
            </div>

            <div className="rounded border p-3 space-y-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Field masking</span>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={config.observability.masking.enabled}
                    onChange={(e) => updateObs("masking", { ...config.observability.masking, enabled: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-input accent-primary" />
                  Enabled
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Automatically redact sensitive fields (API keys, passwords, tokens) from telemetry payloads before they leave the agent.</p>
              <div className="flex flex-wrap gap-1.5">
                {config.observability.masking.sensitive_fields.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {f}
                    <button type="button" onClick={() => updateObs("masking", {
                      ...config.observability.masking,
                      sensitive_fields: config.observability.masking.sensitive_fields.filter((_, j) => j !== i),
                    })}
                      className="text-muted-foreground hover:text-foreground ml-0.5">
                      ×
                    </button>
                  </Badge>
                ))}
                <button type="button" onClick={() => {
                  const field = prompt("Add sensitive field:");
                  if (field) updateObs("masking", {
                    ...config.observability.masking,
                    sensitive_fields: [...config.observability.masking.sensitive_fields, field],
                  });
                }}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-dashed border-input">
                  + Add field
                </button>
              </div>
            </div>

            <div className="rounded border p-3 space-y-2 hover:bg-muted/30 transition-colors">
              <span className="text-sm font-medium block">Sampling</span>
              <p className="text-xs text-muted-foreground">Control what fraction of telemetry events are recorded. Lower rates reduce storage but may miss rare events.</p>
              <div className="space-y-1">
                <Label className="text-xs">Default rate</Label>
                <input type="range" min="0" max="1" step="0.1"
                  value={config.observability.sampling.default_rate}
                  onChange={(e) => updateObs("sampling", {
                    ...config.observability.sampling,
                    default_rate: parseFloat(e.target.value),
                  })}
                  className="w-full accent-primary" />
                <span className="text-xs text-muted-foreground">
                  {Math.round(config.observability.sampling.default_rate * 100)}%
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Rules</span>
                  <button type="button" onClick={() => updateObs("sampling", {
                    ...config.observability.sampling,
                    rules: [...config.observability.sampling.rules, { action: "", rate: 1.0 } as SamplingRule],
                  })}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add rule
                  </button>
                </div>
                {config.observability.sampling.rules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <Input placeholder="action pattern" value={rule.action}
                      onChange={(e) => {
                        const rules = [...config.observability.sampling.rules];
                        rules[i] = { ...rules[i], action: e.target.value };
                        updateObs("sampling", { ...config.observability.sampling, rules });
                      }}
                      className="h-8 text-xs flex-1" />
                    <Input type="number" min="0" max="1" step="0.1" value={rule.rate}
                      onChange={(e) => {
                        const rules = [...config.observability.sampling.rules];
                        rules[i] = { ...rules[i], rate: parseFloat(e.target.value) || 0 };
                        updateObs("sampling", { ...config.observability.sampling, rules });
                      }}
                      className="h-8 text-xs w-20" />
                    <button type="button" onClick={() => updateObs("sampling", {
                      ...config.observability.sampling,
                      rules: config.observability.sampling.rules.filter((_, j) => j !== i),
                    })}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border p-3 space-y-2 hover:bg-muted/30 transition-colors">
              <span className="text-sm font-medium block">Buffering</span>
              <p className="text-xs text-muted-foreground">Batch telemetry events before sending. Larger buffers reduce network calls but increase memory usage and delivery latency.</p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Max size</Label>
                  <Input type="number" value={config.observability.buffering.max_size}
                    onChange={(e) => updateObs("buffering", {
                      ...config.observability.buffering,
                      max_size: parseInt(e.target.value) || 0,
                    })}
                    className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Flush interval (s)</Label>
                  <Input type="number" value={config.observability.buffering.flush_interval}
                    onChange={(e) => updateObs("buffering", {
                      ...config.observability.buffering,
                      flush_interval: parseFloat(e.target.value) || 0,
                    })}
                    className="h-8 text-xs" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Platforms</span>
              <div className="grid gap-3">
                {(["console", "file", "webhook", "prometheus", "datadog"] as PlatformKey[]).map((pk) => {
                  const p = config.observability.platforms[pk];
                  return (
                    <div key={pk} className="rounded border p-3 space-y-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{pk}</span>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={p.enabled}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], enabled: e.target.checked };
                              updateObs("platforms", platforms);
                            }}
                            className="h-3.5 w-3.5 rounded border-input accent-primary" />
                          Enabled
                        </label>
                      </div>
                      {pk === "console" && p.enabled && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Format:</span>
                          <select value={p.format}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], format: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="rounded border border-input bg-background px-2 py-1 text-xs">
                            <option value="human">Human</option>
                            <option value="json">JSON</option>
                          </select>
                        </div>
                      )}
                      {pk === "file" && p.enabled && (
                        <Input type="text" value={p.path || ""}
                          onChange={(e) => {
                            const platforms = { ...config.observability.platforms };
                            platforms[pk] = { ...platforms[pk], path: e.target.value };
                            updateObs("platforms", platforms);
                          }}
                          className="h-8 text-xs" placeholder="/var/log/resk/actions.jsonl" />
                      )}
                      {pk === "webhook" && p.enabled && (
                        <Input type="url" value={p.url || ""}
                          onChange={(e) => {
                            const platforms = { ...config.observability.platforms };
                            platforms[pk] = { ...platforms[pk], url: e.target.value };
                            updateObs("platforms", platforms);
                          }}
                          className="h-8 text-xs" placeholder="https://hooks.example.com/events" />
                      )}
                      {pk === "prometheus" && p.enabled && (
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                          <Input type="url" value={p.pushgateway_url || ""}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], pushgateway_url: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="h-8 text-xs" placeholder="Pushgateway URL" />
                          <Input type="text" value={p.job_name || ""}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], job_name: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="h-8 text-xs" placeholder="Job name" />
                        </div>
                      )}
                      {pk === "datadog" && p.enabled && (
                        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                          <Input type="password" value={p.api_key || ""}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], api_key: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="h-8 text-xs" placeholder="API key" />
                          <Input type="text" value={p.site || ""}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], site: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="h-8 text-xs" placeholder="Site" />
                          <Input type="text" value={p.tags || ""}
                            onChange={(e) => {
                              const platforms = { ...config.observability.platforms };
                              platforms[pk] = { ...platforms[pk], tags: e.target.value };
                              updateObs("platforms", platforms);
                            }}
                            className="h-8 text-xs" placeholder="Tags" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded whitespace-nowrap z-50 shadow">
        {content}
      </span>
    </span>
  );
}
