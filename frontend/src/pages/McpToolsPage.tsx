import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Capability, Role } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, Badge, ErrorAlert } from "@/components/ui";
import { Check, X, Wrench, Database, Mail, Lock, Shield, Terminal, Users } from "lucide-react";

interface Category {
  label: string;
  icon: any;
  bits: number[];
}

const CATEGORIES: Category[] = [
  { label: "Tool Access", icon: Terminal, bits: [0, 1] },
  { label: "Data Access", icon: Database, bits: [2, 3] },
  { label: "Communication", icon: Mail, bits: [4] },
  { label: "Privacy", icon: Lock, bits: [5] },
  { label: "Administration", icon: Users, bits: [6, 7] },
];

const BIT_NAMES: Record<number, string> = {
  0: "Call functions/tools",
  1: "Generate executable code",
  2: "Read database",
  3: "Write to database",
  4: "Send emails",
  5: "Access personal data",
  6: "Manage users",
  7: "Modify configuration",
};

export function McpToolsPage() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [c, r] = await Promise.all([
        api.get<Capability[]>("/api/capabilities"),
        api.get<Role[]>("/api/roles"),
      ]);
      setCaps(c);
      setRoles(r);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => { load(); }, []);

  function hasBit(role: Role, bit: number): boolean {
    return ((role.capabilities_mask ?? 0) & (1 << bit)) !== 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tools & Capabilities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capabilities grouped by category and their assignment across roles.
          </p>
        </div>
      </div>

      <ErrorAlert message={err} />

      {CATEGORIES.map((cat) => {
        const catCaps = caps.filter((c) => cat.bits.includes(c.bit_position));
        if (catCaps.length === 0) return null;
        return (
          <Card key={cat.label}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <cat.icon className="h-5 w-5 text-muted-foreground" />
                {cat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {catCaps.map((cap) => (
                  <div key={cap.bit_position} className="flex items-center gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{cap.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          bit {cap.bit_position}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                        {BIT_NAMES[cap.bit_position] || cap.description || "\u2014"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {roles.map((role) => (
                        <div
                          key={role.id}
                          className="flex flex-col items-center gap-0.5 min-w-[72px]"
                        >
                          <span className="text-[9px] text-muted-foreground truncate max-w-[72px] text-center leading-tight">
                            {role.name}
                          </span>
                          {hasBit(role, cap.bit_position) ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground/30" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {caps.length === 0 && !err && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No capabilities defined. Create them in{" "}
            <button
              className="underline text-primary hover:text-primary/80"
              onClick={() => window.location.href = "/roles"}
            >
              Roles &rarr; Tools & Permissions
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
