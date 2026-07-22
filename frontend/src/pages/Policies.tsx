import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { Policy } from "@/lib/types";
import {
  Button, Table, TBody, TD, TH, THead, TR,
  Badge, ErrorAlert,
} from "@/components/ui";
import { Plus, Download, Upload, FileText, Search, Lock, BrainCircuit } from "lucide-react";

export function Policies() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setPolicies(await api.get<Policy[]>("/api/policies"));
    } catch (e) { setErr(String(e)); }
  }
  useEffect(() => { load(); }, []);

  async function exportYaml(id: string) {
    window.open(`/api/policies/${id}/export`, "_blank");
  }

  async function importYaml(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try { await api.upload("/api/policies/import", fd); load(); }
    catch (e) { setErr(String(e)); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Policies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each policy combines named rules with semantic detection, access control, and classifiers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Import YAML
          </Button>
          <input ref={fileRef} type="file" accept=".yaml,.yml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importYaml(f); e.target.value = ""; }} />
          <Button onClick={() => navigate("/policies/new")}>
            <Plus className="mr-1 h-4 w-4" /> New policy
          </Button>
        </div>
      </div>

      <ErrorAlert message={err} />

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Description</TH>
            <TH className="w-16">Rules</TH>
            <TH className="w-16">Semantic</TH>
            <TH className="w-16">ACL</TH>
            <TH className="w-16">Classifiers</TH>
            <TH className="w-20"></TH>
          </TR>
        </THead>
        <TBody>
          {policies.map((p) => {
            const hasRules = p.rules && p.rules.length > 0;
            const hasSemantic = p.semantic_detection?.enabled;
            const hasACL = p.access_control?.enabled;
            const hasClassifiers = p.classifiers?.enabled;
            return (
              <TR key={p.id} className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/policies/${p.id}`)}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="text-muted-foreground max-w-xs truncate">{p.description || "\u2014"}</TD>
                <TD>
                  {hasRules
                    ? <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{p.rules.length}</Badge>
                    : <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                </TD>
                <TD>
                  {hasSemantic
                    ? <Badge variant="default" className="gap-1"><Search className="h-3 w-3" /> On</Badge>
                    : <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                </TD>
                <TD>
                  {hasACL
                    ? <Badge variant="default" className="gap-1"><Lock className="h-3 w-3" /> On</Badge>
                    : <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                </TD>
                <TD>
                  {hasClassifiers
                    ? <Badge variant="default" className="gap-1"><BrainCircuit className="h-3 w-3" /> On</Badge>
                    : <span className="text-xs text-muted-foreground">{"\u2014"}</span>}
                </TD>
                <TD>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); exportYaml(p.id); }}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            );
          })}
          {policies.length === 0 && (
            <TR><TD colSpan={7} className="text-center py-8 text-muted-foreground">No policies yet.</TD></TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
