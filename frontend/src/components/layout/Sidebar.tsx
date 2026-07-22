import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Shield, FileText, ScrollText,
  LogOut, Cpu, ChevronDown, Cog, Eye, Settings as SettingsIcon,
  Search, Lock, BrainCircuit, AlertTriangle,
  Server, Puzzle, Brain, Sun, Moon, Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVisitorId } from "@/lib/tracker";

interface SubItem {
  to: string;
  label: string;
  icon: any;
}

interface NavItem {
  to?: string;
  label: string;
  icon: any;
  end?: boolean;
  children?: SubItem[];
}

const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/users", label: "Users", icon: Users },
  { to: "/roles", label: "Roles", icon: Shield },
  {
    to: "/policies", label: "Policies", icon: FileText,
    children: [
      { to: "/policies/rules", label: "Rules", icon: FileText },
      { to: "/policies/semantic-detection", label: "Semantic Detection", icon: Search },
      { to: "/policies/access-control", label: "Access Control", icon: Lock },
      { to: "/policies/classifiers", label: "Classifiers", icon: BrainCircuit },
      { to: "/policies/scanning-pipeline", label: "Scanning Pipeline", icon: AlertTriangle },
    ],
  },
  {
    label: "Providers", icon: Cpu,
    children: [
      { to: "/providers", label: "All Providers", icon: Cpu },
    ],
  },
  {
    label: "Integrations", icon: Puzzle,
    children: [
      { to: "/integrations/mcp", label: "MCP Servers", icon: Server },
      { to: "/integrations/tools", label: "MCP Tools", icon: Wrench },
    ],
  },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/observability", label: "Observability", icon: Eye },
  { to: "/logs", label: "Logs", icon: ScrollText },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    if (typeof document === "undefined") return false;
    const stored = localStorage.getItem("resk-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("resk-theme", dark ? "dark" : "light");
  }, [dark]);

  const currentPath = location.pathname + location.search;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      nav.forEach((n) => {
        if (n.children) {
          const hasActive = n.children.some((c) => currentPath.startsWith(c.to));
          if (hasActive) next[n.label] = true;
        }
      });
      return next;
    });
  }, [currentPath]);

  function toggle(label: string) {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const isActiveParent = (label: string, to?: string) => {
    if (to && currentPath === to) return true;
    return false;
  };

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-5 font-semibold">
        RESK <span className="ml-2 text-xs text-muted-foreground">Firewall</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((n) => {
          if (n.children) {
            const open = expanded[n.label] ?? false;
            const hasActive = n.children.some((c) => currentPath.startsWith(c.to));
            return (
              <div key={n.label}>
                <div className="flex">
                  {n.to ? (
                    <NavLink
                      to={n.to}
                      end
                      onClick={() => toggle(n.label)}
                      className={({ isActive }) =>
                        cn(
                          "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                    >
                      <n.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{n.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </NavLink>
                  ) : (
                    <button
                      onClick={() => toggle(n.label)}
                      className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <n.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{n.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l pl-2">
                    {n.children.map((c) => (
                      <NavLink
                        key={c.label}
                        to={c.to}
                        end
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )
                        }
                      >
                        <c.icon className="h-3 w-3 shrink-0" />
                        {c.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <NavLink
              key={n.to}
              to={n.to!}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t p-3 space-y-1">
        <div className="mb-2 truncate px-2 text-xs text-muted-foreground">
          {user?.username} {user?.is_admin && "(admin)"}
        </div>
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </NavLink>
        <button
          onClick={() => setDark(!dark)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
        <div className="px-2 text-[10px] text-muted-foreground truncate">
          visitor: {getVisitorId()?.slice(0, 8)}…
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={async () => {
            await logout();
            window.location.reload();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </aside>
  );
}
