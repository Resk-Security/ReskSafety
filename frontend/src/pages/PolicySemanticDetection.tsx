import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { PolicyConfig, SemanticDetectionConfig, AttackPattern, VectorDbConfig } from "@/lib/types";
import {
  Button, Input, Label,
  ErrorAlert, Tooltip,
} from "@/components/ui";
import { Plus, Trash2, Pencil, Globe, Wifi, WifiOff, Database, Server, Save, ArrowLeft } from "lucide-react";

/* ── Vector DB backends ── */

const VECTOR_BACKENDS = [
  { value: "local", label: "Local (TF-IDF)", desc: "Built-in TF-IDF cosine similarity — no external dependencies", isVectorDb: false },
  { value: "pinecone", label: "Pinecone", desc: "Pinecone Serverless vector database with integrated storage", isVectorDb: true },
  { value: "weaviate", label: "Weaviate", desc: "Weaviate Cloud vector database with hybrid search", isVectorDb: true },
  { value: "qdrant", label: "Qdrant", desc: "Qdrant Cloud vector database — high-performance similarity search", isVectorDb: true },
  { value: "chromadb", label: "ChromaDB", desc: "ChromaDB — open-source, self-hosted vector database", isVectorDb: true },
  { value: "milvus", label: "Milvus", desc: "Milvus / Zilliz Cloud vector database for scale", isVectorDb: true },
  { value: "pgvector", label: "pgvector", desc: "PostgreSQL pgvector extension — use your existing DB", isVectorDb: true },
];

const VECTOR_METRICS = [
  { value: "cosine", label: "Cosine similarity" },
  { value: "dot", label: "Dot product" },
  { value: "euclidean", label: "Euclidean distance" },
];

const EMBEDDING_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "huggingface", label: "HuggingFace" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "cohere", label: "Cohere" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "mistral", label: "Mistral AI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "together", label: "Together AI" },
  { value: "custom", label: "Custom endpoint" },
];

const EMBEDDING_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  huggingface: "sentence-transformers/all-MiniLM-L6-v2",
  anthropic: "claude-3-haiku-20240307",
  google: "text-embedding-004",
  cohere: "embed-english-v3.0",
  azure: "text-embedding-ada-002",
  mistral: "mistral-embed",
  deepseek: "deepseek-embedding",
  together: "togethercomputer/m2-bert-80M-8k-retrieval",
  custom: "",
};

/* ── Helpers ── */

function defaultVectorDb(): VectorDbConfig {
  return { enabled: false, type: "pinecone", endpoint: "", api_key: "", index_name: "", dimension: 1536, metric: "cosine" };
}

function defaultSdConfig(): SemanticDetectionConfig {
  return {
    enabled: true, threshold: 0.85, backend: "local",
    vector_db: null,
    external_connector: { enabled: false, provider: "openai", api_key: "", model: "text-embedding-3-small", endpoint: "", timeout: 30 },
    attack_patterns: [],
    min_confidence_threshold: 0.3, block_score_threshold: 5.0,
    block_categories: ["direct_injection", "bypass_detection", "exfiltration"],
    block_on_first_threat: true,
  };
}

function emptyForm() {
  return { name: "", description: "", config: defaultSdConfig() };
}

/* ── Component ── */

export function PolicySemanticDetection() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<PolicyConfig[]>([]);
  const [editing, setEditing] = useState<PolicyConfig | null>(null);
  const [form, setForm] = useState<{ name: string; description: string; config: SemanticDetectionConfig }>(emptyForm());
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);


  async function load() {
    try {
      setConfigs(await api.get<PolicyConfig[]>(`/api/policy-configs?type=semantic_detection`));
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
  }

  function startEdit(c: PolicyConfig) {
    setEditing(c);
    setForm({ name: c.name, description: c.description, config: c.config as SemanticDetectionConfig });
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
          name: form.name, description: form.description, config_type: "semantic_detection", config: form.config,
        });
      }
      setEditing(null);
      setForm(emptyForm());
      load();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function remove(c: PolicyConfig) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api.del(`/api/policy-configs/${c.id}`); load(); }
    catch (e) { setErr(String(e)); }
  }

  function updateConfig<K extends keyof SemanticDetectionConfig>(k: K, v: SemanticDetectionConfig[K]) {
    setForm((f) => ({ ...f, config: { ...f.config, [k]: v } }));
  }

  function handleBackendChange(value: string) {
    const backend = VECTOR_BACKENDS.find(b => b.value === value);
    if (backend?.isVectorDb) {
      setForm((f) => ({ ...f, config: { ...f.config, backend: value, vector_db: { ...defaultVectorDb(), enabled: true, type: value } } }));
    } else {
      setForm((f) => ({ ...f, config: { ...f.config, backend: value, vector_db: null } }));
    }
  }

  function updateVectorDb<K extends keyof NonNullable<SemanticDetectionConfig["vector_db"]>>(k: K, v: NonNullable<SemanticDetectionConfig["vector_db"]>[K]) {
    setForm((f) => {
      const vdb = f.config.vector_db || { ...defaultVectorDb(), enabled: true, type: f.config.backend };
      return { ...f, config: { ...f.config, vector_db: { ...vdb, [k]: v } } };
    });
  }

  function updateConnector<K extends keyof SemanticDetectionConfig["external_connector"]>(k: K, v: SemanticDetectionConfig["external_connector"][K]) {
    setForm((f) => ({ ...f, config: { ...f.config, external_connector: { ...f.config.external_connector, [k]: v } } }));
  }

  const isVectorDb = VECTOR_BACKENDS.find(b => b.value === form.config.backend)?.isVectorDb ?? false;

  /* ── Editor mode ── */
  if (editing !== undefined) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={cancelEdit}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="text-2xl font-semibold">{editing ? `Edit: ${editing.name}` : "New semantic detection config"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure vector DB backend and detection thresholds.
              </p>
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
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Strict prompt protection" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this config blocks" />
            </div>
          </div>
        </div>

        {/* ── Vector DB backend ── */}
        <div className="space-y-5">
          <div className="rounded border p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Vector database backend</span>
            </div>
            <div className="space-y-1">
              <Label>Backend</Label>
              <select value={form.config.backend}
                onChange={(e) => handleBackendChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {VECTOR_BACKENDS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{VECTOR_BACKENDS.find((b) => b.value === form.config.backend)?.desc}</p>
            </div>
            {isVectorDb && (
              <div className="rounded border bg-muted/10 p-3 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Connection</span>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Endpoint URL</Label>
                    <Input value={form.config.vector_db?.endpoint || ""} onChange={(e) => updateVectorDb("endpoint", e.target.value)} className="h-8 text-xs font-mono" placeholder="https://xxx.pinecone.io" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">API key</Label>
                    <Input type="password" value={form.config.vector_db?.api_key || ""} onChange={(e) => updateVectorDb("api_key", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Index / Collection name</Label>
                    <Input value={form.config.vector_db?.index_name || ""} onChange={(e) => updateVectorDb("index_name", e.target.value)} className="h-8 text-xs font-mono" placeholder="my-index" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vector dimension</Label>
                    <Input type="number" min={64} max={8192} step={1} value={form.config.vector_db?.dimension ?? 1536} onChange={(e) => updateVectorDb("dimension", parseInt(e.target.value) || 1536)} className="h-8 text-xs font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Distance metric</Label>
                    <select value={form.config.vector_db?.metric || "cosine"} onChange={(e) => updateVectorDb("metric", e.target.value)}
                      className="w-full rounded border border-input bg-background px-3 py-2 text-sm">
                      {VECTOR_METRICS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Similarity threshold</Label>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="1" step="0.05" value={form.config.threshold}
                onChange={(e) => updateConfig("threshold", parseFloat(e.target.value))} className="flex-1 accent-primary" />
              <span className="text-xs font-mono w-10">{form.config.threshold.toFixed(2)}</span>
            </div>
          </div>

          {/* ── External embedding API ── */}
          <div className="rounded border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> External embedding API
              </span>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.config.external_connector.enabled}
                  onChange={(e) => updateConnector("enabled", e.target.checked)} className="h-3.5 w-3.5 rounded border-input accent-primary" />
                {form.config.external_connector.enabled ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-muted-foreground" />}
              </label>
            </div>
            {form.config.external_connector.enabled && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Provider</Label>
                  <select value={form.config.external_connector.provider}
                    onChange={(e) => { const p = e.target.value; updateConnector("provider", p); updateConnector("model", EMBEDDING_MODELS[p] || ""); }}
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm">
                    {EMBEDDING_PROVIDERS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model</Label>
                  <Input value={form.config.external_connector.model} onChange={(e) => updateConnector("model", e.target.value)} className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">API key</Label>
                  <Input type="password" value={form.config.external_connector.api_key} onChange={(e) => updateConnector("api_key", e.target.value)} className="h-8 text-xs" />
                </div>
                {form.config.external_connector.provider === "custom" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Endpoint</Label>
                    <Input value={form.config.external_connector.endpoint} onChange={(e) => updateConnector("endpoint", e.target.value)} className="h-8 text-xs font-mono" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Timeout (s)</Label>
                  <Input type="number" min={5} max={120} value={form.config.external_connector.timeout}
                    onChange={(e) => updateConnector("timeout", parseInt(e.target.value) || 30)} className="h-8 text-xs" />
                </div>
              </div>
            )}
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
          <h1 className="text-2xl font-semibold">Semantic Detection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable vector similarity detection configs. Create, edit, and later attach them to policies.
          </p>
        </div>
        <Button onClick={startCreate}><Plus className="mr-1 h-4 w-4" /> New config</Button>
      </div>

      <ErrorAlert message={err} />

      {configs.length === 0 ? (
        <div className="rounded border p-8 text-center">
          <Database className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No semantic detection configs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to define vector DB backends, block categories, and attack patterns. Then attach it to a policy.</p>
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
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                    {(c.config as SemanticDetectionConfig).backend}
                  </span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {(c.config as SemanticDetectionConfig).block_categories?.length ?? 0} categories
                  </span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {(c.config as SemanticDetectionConfig).attack_patterns?.length ?? 0} patterns
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
