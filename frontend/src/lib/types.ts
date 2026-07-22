export interface MeResponse {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  capabilities_mask: number;
  active_bits: number[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  roles?: Role[];
}

export interface UserWithMask extends User {
  capabilities_mask: number;
  active_bits: number[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  capabilities_mask: number;
  active_bits?: number[];
  mcp_tool_allowlist?: string[];
}

export interface Capability {
  bit_position: number;
  name: string;
  description: string;
}

export interface PolicyRule {
  id?: string;
  name: string;
  description: string;
  rule_type: "exact" | "contains" | "startswith";
  phrases: string[];
  mode: "hard" | "bias";
  penalty: number;
  created_at?: string;
  updated_at?: string;
}

export interface ScanningPipelineConfig {
  block_categories: string[];
  attack_patterns: AttackPattern[];
  block_on_first_threat: boolean;
  min_confidence_threshold: number;
  block_score_threshold: number;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  mask: number | null;
  rules: PolicyRule[];
  semantic_detection: SemanticDetectionConfig | null;
  access_control: AccessControlConfig | null;
  classifiers: ClassifiersConfig | null;
  scanning_pipeline: ScanningPipelineConfig | null;
  memory_injection_rules: Array<MemoryInjectionRule> | null;
  context_strategy: ContextStrategy | null;
  semantic_detection_config_id: string | null;
  access_control_config_id: string | null;
  classifiers_config_id: string | null;
  scanning_pipeline_config_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryInjectionRule {
  id?: string;
  field: string;
  content: string;
  inject_at: "always" | "first_only" | "every_n" | "never";
  inject_every_n?: number;
  priority: number;
}

export interface ContextStrategy {
  max_tokens: number;
  strategy: "truncate" | "summarize" | "fail" | "roll_window";
  system_budget?: number;
  memory_budget?: number;
  turns_budget?: number;
}

export interface PolicyConfig {
  id: string;
  name: string;
  description: string;
  config_type: "semantic_detection" | "access_control" | "classifiers" | "scanning_pipeline";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ModelTokenizerConfig {
  model_name: string;
  tokenizer_name: string | null;
  trust_remote_code: boolean;
  add_prefix_space: boolean;
  custom_special_tokens: string[];
  detected_special_tokens: Record<string, string>;
  detected_special_token_ids: number[];
}

export interface GlobalSettings {
  scanning: {
    fail_open: boolean;
    enable_caching: boolean;
    max_input_length: number;
    languages: string[];
    request_timeout_ms: number;
    rate_limit_per_sec: number;
    concurrent_scan_limit: number;
    cache_ttl_sec: number;
    stop_on_first_match: boolean;
    log_all_scan_results: boolean;
    block_on_engine_error: boolean;
  };
  logits: {
    device: string;
    hot_reload_interval: number;
    batch_size: number;
    max_sequence_length: number;
    default_shadow_penalty: number;
    fallback_action: string;
  };
  observability: {
    sampling_default_rate: number;
    buffering_max_size: number;
    flush_interval_sec: number;
    mask_sensitive_fields: boolean;
  };
  pipeline: {
    default_action: string;
    log_level: string;
    enable_telemetry: boolean;
    maintenance_mode: boolean;
  };
  tokenizers: {
    protect_special_tokens: boolean;
    cache_enabled: boolean;
    timeout_sec: number;
    model_tokenizers: Record<string, ModelTokenizerConfig>;
  };
}

export interface LogEntry {
  id: string;
  user_id: string | null;
  policy_id: string | null;
  status: string;
  backend_type: string;
  model: string;
  blocked_phrase: string | null;
  created_at: string;
}

export interface Stats {
  total_requests: number;
  blocked_requests: number;
  success_requests: number;
  error_requests: number;
  blocked_ratio: number;
  by_user: Record<string, number>;
  by_rule: Record<string, number>;
}

export interface SessionData {
  id: string;
  user_id: string | null;
  session_id: string;
  agent_id: string;
  agent_type: string;
  status: string;
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  tools_connected: string[];
  metadata: Record<string, any> | null;
  started_at: string | null;
  last_seen_at: string | null;
}

export interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  total_tokens: number;
  unique_tools: string[];
  unique_agents: number;
  daily: Array<{ date: string; tokens: number; sessions: number }>;
}

export interface SecurityLayerConfig {
  input_scanning: boolean;
  logits_filtering: boolean;
}

export interface Provider {
  id: string;
  name: string;
  provider_type: string;
  endpoint: string;
  api_key_masked: string | null;
  models: string[] | null;
  default_model: string;
  stream_supported: boolean;
  is_active: boolean;
  security_config: SecurityLayerConfig | null;
  created_at: string;
  updated_at: string;
}

export interface ScanningConfig {
  enabled: boolean;
  fail_open: boolean;
  block_on_first_threat: boolean;
  min_confidence_threshold: number;
  block_score_threshold: number;
  severity_weights: Record<string, number>;
  languages: string[];
  max_input_length: number;
  enable_caching: boolean;
}

export interface MultiLevelConfig {
  enabled: boolean;
  penalties: Record<string, number>;
}

export interface LogitsConfig {
  enabled: boolean;
  device: string;
  shadow_penalty: number;
  multi_level: MultiLevelConfig;
  hot_reload_interval: number;
}

export interface PlatformConfig {
  enabled: boolean;
  format?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  pushgateway_url?: string;
  job_name?: string;
  api_key?: string;
  site?: string;
  tags?: string;
}

export interface MaskingConfig {
  enabled: boolean;
  sensitive_fields: string[];
}

export interface SamplingRule {
  action: string;
  rate: number;
}

export interface SamplingConfig {
  default_rate: number;
  rules: SamplingRule[];
}

export interface BufferingConfig {
  max_size: number;
  flush_interval: number;
}

export interface PlatformsConfig {
  console: PlatformConfig;
  file: PlatformConfig;
  webhook: PlatformConfig;
  prometheus: PlatformConfig;
  datadog: PlatformConfig;
}

export interface ObservabilityConfig {
  enabled: boolean;
  environment: string;
  masking: MaskingConfig;
  sampling: SamplingConfig;
  buffering: BufferingConfig;
  platforms: PlatformsConfig;
}

export interface AttackPattern {
  label: string;
  pattern: string;
  tags: string[];
}

export interface ExternalConnector {
  enabled: boolean;
  provider: string;
  api_key: string;
  model: string;
  endpoint: string;
  timeout: number;
}

export interface VectorDbConfig {
  enabled: boolean;
  type: string;
  endpoint: string;
  api_key: string;
  index_name: string;
  dimension: number;
  metric: string;
}

export interface SemanticDetectionConfig {
  enabled: boolean;
  threshold: number;
  backend: string;
  vector_db: VectorDbConfig | null;
  external_connector: ExternalConnector;
  attack_patterns: AttackPattern[];
  // Scanning pipeline (was scanning_config)
  min_confidence_threshold: number;
  block_score_threshold: number;
  block_categories: string[];
  block_on_first_threat: boolean;
}

export interface AclNode {
  condition?: string | null;
  branches?: Record<string, AclNode>;
  action?: string | null;
  reason?: string | null;
}

export interface AccessControlConfig {
  enabled: boolean;
  root: AclNode | null;
}

export interface ClassifierRule {
  name: string;
  model: string;
  enabled: boolean;
  threshold: number;
  action: string;
  category: string;
}

export interface ClassifiersConfig {
  enabled: boolean;
  rules: ClassifierRule[];
  // Logits filtering (was logits_config)
  shadow_penalty: number;
  multi_level: {
    enabled: boolean;
    penalties: Record<string, number>;
  };
}

export interface SecurityConfig {
  scanning: ScanningConfig;
  logits: LogitsConfig;
  observability: ObservabilityConfig;
}

// ── Phase 2: Model ──
export interface ModelEntity {
  id: string;
  provider_id: string | null;
  name: string;
  type: "remote" | "local";
  temperature: number | null;
  top_k: number | null;
  max_tokens: number | null;
  stream_supported: boolean;
  context_window: number | null;
  response_length_limit: number | null;
  special_tokens: Record<string, number> | null;
  context_full_strategy: string;
  injection_rules: Array<Record<string, any>> | null;
  tokenizer_config: ModelTokenizerConfig | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelSecurityInfo {
  model_id: string;
  model_name: string;
  policies: Array<{ policy_id: string; hook_id: string | null }>;
  hooks: Array<{ id: string; name: string; type: string; action: string }>;
}

// ── Phase 3: Memory ──
export interface MemoryEntry {
  id: string;
  session_id: string;
  turn_number: number;
  role: string;
  content: string;
  summary: string | null;
  token_count: number | null;
  priority: number;
  inject_at: string;
  inject_every_n: number | null;
  created_at: string;
}

// ── Phase 4: Hook ──
export interface Hook {
  id: string;
  name: string;
  hook_type: string;
  command: string;
  timeout_sec: number;
  action: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HookResult {
  hook_id: string;
  hook_name: string;
  hook_type: string;
  action: string;
  allowed: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
}

// ── Phase 5: MCP ──
export interface McpServer {
  id: string;
  name: string;
  endpoint: string;
  auth_type: string;
  api_key_masked: string | null;
  trust_level: string;
  allowed_tools: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface McpToolResult {
  success: boolean;
  result: Record<string, any> | null;
  error: string | null;
}
