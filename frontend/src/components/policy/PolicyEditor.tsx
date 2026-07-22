import type { Policy, PolicyRule, SemanticDetectionConfig, AccessControlConfig, ClassifiersConfig, ScanningPipelineConfig } from "@/lib/types";
import { Input, Label } from "@/components/ui";
import { RuleEditor } from "@/components/policy/RuleEditor";

interface Props {
  policy: PolicyForm;
  onChange: (patch: Partial<PolicyForm>) => void;
}

export interface PolicyForm {
  name: string;
  description: string;
  rules: PolicyRule[];
  semantic_detection: SemanticDetectionConfig | null;
  access_control: AccessControlConfig | null;
  classifiers: ClassifiersConfig | null;
  scanning_pipeline: ScanningPipelineConfig | null;
  semantic_detection_config_id: string | null;
  access_control_config_id: string | null;
  classifiers_config_id: string | null;
  scanning_pipeline_config_id: string | null;
}

export function emptyPolicyForm(): PolicyForm {
  return {
    name: "",
    description: "",
    rules: [],
    semantic_detection: null,
    access_control: null,
    classifiers: null,
    scanning_pipeline: null,
    semantic_detection_config_id: null,
    access_control_config_id: null,
    classifiers_config_id: null,
    scanning_pipeline_config_id: null,
  };
}

export function policyToForm(p: Policy): PolicyForm {
  return {
    name: p.name,
    description: p.description,
    rules: p.rules || [],
    semantic_detection: p.semantic_detection,
    access_control: p.access_control,
    classifiers: p.classifiers,
    scanning_pipeline: p.scanning_pipeline,
    semantic_detection_config_id: p.semantic_detection_config_id,
    access_control_config_id: p.access_control_config_id,
    classifiers_config_id: p.classifiers_config_id,
    scanning_pipeline_config_id: p.scanning_pipeline_config_id,
  };
}

export function PolicyEditor({ policy, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={policy.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Strict SQL blocking" />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input value={policy.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What does this policy enforce?" />
        </div>
      </div>

      <div className="rounded border p-3 space-y-2">
        <Label className="text-sm font-medium">Rules</Label>
        <p className="text-xs text-muted-foreground">
          Named, atomic rules that define phrase-level blocking or biasing.
        </p>
        <RuleEditor rules={policy.rules} onChange={(rules) => onChange({ rules })} />
      </div>
    </div>
  );
}
