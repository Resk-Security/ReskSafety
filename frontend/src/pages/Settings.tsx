import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GlobalSettings } from "@/lib/types";
import { Button, Input, Label, ErrorAlert, Tooltip } from "@/components/ui";
import { Save, HelpCircle } from "lucide-react";

const LANGUAGES = ["en", "fr"];
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const FALLBACK_ACTIONS = ["block", "allow", "cache_last"];
const PIPELINE_ACTIONS = ["allow", "block"];

const DEFAULTS: GlobalSettings = {
  scanning: {
    fail_open: false, enable_caching: true, max_input_length: 100000,
    request_timeout_ms: 5000, rate_limit_per_sec: 100, concurrent_scan_limit: 50,
    cache_ttl_sec: 300, stop_on_first_match: false, log_all_scan_results: true,
    block_on_engine_error: false, languages: ["en", "fr"],
  },
  logits: {
    device: "cpu", hot_reload_interval: 60, batch_size: 32,
    max_sequence_length: 2048, default_shadow_penalty: -15.0, fallback_action: "block",
  },
  observability: {
    sampling_default_rate: 1.0, buffering_max_size: 10000,
    flush_interval_sec: 10, mask_sensitive_fields: true,
  },
  pipeline: {
    default_action: "allow", log_level: "info",
    enable_telemetry: true, maintenance_mode: false,
  },
  tokenizers: {
    protect_special_tokens: true, cache_enabled: true, timeout_sec: 30,
    model_tokenizers: {},
  },
};

function T({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <Tooltip content={content}>
      <span className="inline-flex items-center">{children}</span>
    </Tooltip>
  );
}

function FieldTooltip({ tip }: { tip: string }) {
  return (
    <T content={tip}>
      <HelpCircle className="h-3 w-3 text-muted-foreground/40 ml-1 cursor-help" />
    </T>
  );
}

export function Settings() {
  const [config, setConfig] = useState<GlobalSettings>(DEFAULTS);
  const [orig, setOrig] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<GlobalSettings>("/api/settings/global")
      .then((c) => { setConfig(c); setOrig(JSON.stringify(c)); })
      .catch((e) => setErr(String(e)));
  }, []);

  const dirty = JSON.stringify(config) !== orig;

  async function save() {
    setSaving(true);
    try {
      const res = await api.put<GlobalSettings>("/api/settings/global", config);
      setConfig(res);
      setOrig(JSON.stringify(res));
      setErr("");
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  function updateScan<K extends keyof GlobalSettings["scanning"]>(k: K, v: GlobalSettings["scanning"][K]) {
    setConfig((c) => ({ ...c, scanning: { ...c.scanning, [k]: v } }));
  }

  function updateLogits<K extends keyof GlobalSettings["logits"]>(k: K, v: GlobalSettings["logits"][K]) {
    setConfig((c) => ({ ...c, logits: { ...c.logits, [k]: v } }));
  }

  function updateObs<K extends keyof GlobalSettings["observability"]>(k: K, v: GlobalSettings["observability"][K]) {
    setConfig((c) => ({ ...c, observability: { ...c.observability, [k]: v } }));
  }

  function updatePipeline<K extends keyof GlobalSettings["pipeline"]>(k: K, v: GlobalSettings["pipeline"][K]) {
    setConfig((c) => ({ ...c, pipeline: { ...c.pipeline, [k]: v } }));
  }

  function toggleLang(lang: string) {
    setConfig((c) => {
      const langs = c.scanning.languages;
      return { ...c, scanning: { ...c.scanning, languages: langs.includes(lang) ? langs.filter((l) => l !== lang) : [...langs, lang] } };
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Button onClick={save} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <ErrorAlert message={err} />

      <div className="space-y-6">

        {/* ══════════════ 1. Input Scanning ══════════════ */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            Input Scanning — Global
            <FieldTooltip tip="Apply to all policies that have input scanning enabled" />
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.scanning.fail_open}
                onChange={(e) => updateScan("fail_open", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Fail open (allow on engine error)
              <FieldTooltip tip="Allow requests to pass through when the scanning engine encounters an error, rather than blocking them." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.scanning.block_on_engine_error}
                onChange={(e) => updateScan("block_on_engine_error", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Block on engine error
              <FieldTooltip tip="Block all requests when the scanning engine fails. Overrides fail_open when both are enabled." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.scanning.enable_caching}
                onChange={(e) => updateScan("enable_caching", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Enable result caching
              <FieldTooltip tip="Cache scan results so identical inputs skip re-scanning within the cache TTL window." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.scanning.stop_on_first_match}
                onChange={(e) => updateScan("stop_on_first_match", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Stop on first match
              <FieldTooltip tip="Stop the scanning pipeline as soon as the first blocking rule matches. Disable to run all gates and aggregate every result." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.scanning.log_all_scan_results}
                onChange={(e) => updateScan("log_all_scan_results", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Log all scan results
              <FieldTooltip tip="Log every scanning result (pass or fail) to the audit log. Useful for debugging and compliance." />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Max input length
                <FieldTooltip tip="Maximum number of characters allowed per input request. Longer inputs are truncated or rejected." />
              </Label>
              <Input type="number" value={config.scanning.max_input_length}
                onChange={(e) => updateScan("max_input_length", parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Request timeout (ms)
                <FieldTooltip tip="Maximum time in milliseconds to wait for a scanning decision before falling back to the configured error action." />
              </Label>
              <Input type="number" min={100} max={30000} step={100} value={config.scanning.request_timeout_ms}
                onChange={(e) => updateScan("request_timeout_ms", parseInt(e.target.value) || 5000)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Rate limit (req/s)
                <FieldTooltip tip="Maximum number of scanning requests allowed per second globally. Helps prevent resource exhaustion under high load." />
              </Label>
              <Input type="number" min={1} max={10000} value={config.scanning.rate_limit_per_sec}
                onChange={(e) => updateScan("rate_limit_per_sec", parseInt(e.target.value) || 100)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Concurrent scan limit
                <FieldTooltip tip="Maximum number of simultaneous in-flight scanning operations across all policies." />
              </Label>
              <Input type="number" min={1} max={500} value={config.scanning.concurrent_scan_limit}
                onChange={(e) => updateScan("concurrent_scan_limit", parseInt(e.target.value) || 50)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Cache TTL (sec)
                <FieldTooltip tip="How long a cached scan result remains valid in seconds. Set to 0 to disable caching entirely." />
              </Label>
              <Input type="number" min={0} max={86400} value={config.scanning.cache_ttl_sec}
                onChange={(e) => updateScan("cache_ttl_sec", parseInt(e.target.value) || 300)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="inline-flex items-center">
              Languages
              <FieldTooltip tip="Content languages the scanning engine should consider. Multi-language support affects pattern matching and tokenisation." />
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((lang) => {
                const active = config.scanning.languages.includes(lang);
                return (
                  <button key={lang} type="button" onClick={() => toggleLang(lang)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:border-border hover:text-foreground"
                    }`}>
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════ 2. Logits Filtering ══════════════ */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            Logits Filtering — Global
            <FieldTooltip tip="Apply to all policies that have logits-based token filtering enabled. Controls how banned phrases are suppressed at the token level." />
          </h2>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Device
                <FieldTooltip tip="Hardware device for running the logits model. CUDA is recommended for production; CPU works for testing with lower throughput." />
              </Label>
              <select value={config.logits.device}
                onChange={(e) => updateLogits("device", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Hot reload interval (sec)
                <FieldTooltip tip="How often the engine checks for updated policy rules and tokenizer configs without requiring a full restart." />
              </Label>
              <Input type="number" min={5} max={3600} value={config.logits.hot_reload_interval}
                onChange={(e) => updateLogits("hot_reload_interval", parseInt(e.target.value) || 60)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Batch size
                <FieldTooltip tip="Number of tokens processed in parallel by the logits model. Larger batches increase throughput but use more memory." />
              </Label>
              <Input type="number" min={1} max={256} value={config.logits.batch_size}
                onChange={(e) => updateLogits("batch_size", parseInt(e.target.value) || 32)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Max sequence length
                <FieldTooltip tip="Maximum token sequence length the logits model processes. Longer sequences are truncated to this limit." />
              </Label>
              <Input type="number" min={64} max={8192} step={64} value={config.logits.max_sequence_length}
                onChange={(e) => updateLogits("max_sequence_length", parseInt(e.target.value) || 2048)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Default shadow penalty
                <FieldTooltip tip="Logit penalty applied to banned tokens during generation. More negative values = stronger suppression. Set to 0 to disable active suppression." />
              </Label>
              <Input type="number" min={-50} max={0} step={0.5} value={config.logits.default_shadow_penalty}
                onChange={(e) => updateLogits("default_shadow_penalty", parseFloat(e.target.value) || -15)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Fallback action
                <FieldTooltip tip="Behaviour when the logits model is unavailable. 'block' rejects the request, 'allow' lets it pass unchecked, 'cache_last' uses the last known good configuration." />
              </Label>
              <select value={config.logits.fallback_action}
                onChange={(e) => updateLogits("fallback_action", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {FALLBACK_ACTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
          </div>
        </div>

        {/* ══════════════ 3. Observability ══════════════ */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            Observability — Global
            <FieldTooltip tip="Global telemetry and monitoring defaults that apply to all observability platforms." />
          </h2>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Sampling default rate
                <FieldTooltip tip="Fraction of requests sampled for observability. 100% = every request is recorded; lower values reduce storage and cost." />
              </Label>
              <input type="range" min="0" max="1" step="0.05" value={config.observability.sampling_default_rate}
                onChange={(e) => updateObs("sampling_default_rate", parseFloat(e.target.value))}
                className="w-full accent-primary" />
              <span className="text-xs text-muted-foreground font-mono">{(config.observability.sampling_default_rate * 100).toFixed(0)}%</span>
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Buffer max size
                <FieldTooltip tip="Maximum number of telemetry events buffered in memory before flushing. Larger buffers reduce I/O but increase memory usage." />
              </Label>
              <Input type="number" min={100} max={1000000} step={100} value={config.observability.buffering_max_size}
                onChange={(e) => updateObs("buffering_max_size", parseInt(e.target.value) || 10000)} />
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Flush interval (sec)
                <FieldTooltip tip="How often buffered telemetry data is flushed to the configured platforms." />
              </Label>
              <Input type="number" min={1} max={300} value={config.observability.flush_interval_sec}
                onChange={(e) => updateObs("flush_interval_sec", parseInt(e.target.value) || 10)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.observability.mask_sensitive_fields}
                onChange={(e) => updateObs("mask_sensitive_fields", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Mask sensitive fields
              <FieldTooltip tip="Automatically redact sensitive data (API keys, PII, passwords) from observability logs before they leave the system." />
            </label>
          </div>
        </div>

        {/* ══════════════ 4. Pipeline ══════════════ */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            Pipeline — Global
            <FieldTooltip tip="Default behaviour of the security pipeline across all policies." />
          </h2>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Default action (no match)
                <FieldTooltip tip="What to do when no scanning rule matches the input. 'allow' = pass the request through, 'block' = reject it." />
              </Label>
              <select value={config.pipeline.default_action}
                onChange={(e) => updatePipeline("default_action", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PIPELINE_ACTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="inline-flex items-center">
                Log level
                <FieldTooltip tip="Verbosity of engine logs. 'debug' for development, 'info' for normal operation, 'warn' or 'error' for production with minimal noise." />
              </Label>
              <select value={config.pipeline.log_level}
                onChange={(e) => updatePipeline("log_level", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {LOG_LEVELS.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm pt-5">
              <input type="checkbox" checked={config.pipeline.enable_telemetry}
                onChange={(e) => updatePipeline("enable_telemetry", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Enable telemetry
              <FieldTooltip tip="Send anonymous usage statistics and performance metrics to help improve the platform." />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.pipeline.maintenance_mode}
                onChange={(e) => updatePipeline("maintenance_mode", e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary" />
              Maintenance mode
              <FieldTooltip tip="Disables all scanning and filtering. All requests pass through unchecked. Use only during planned maintenance windows." />
            </label>
          </div>
        </div>

      </div>
    </div>
  );
}