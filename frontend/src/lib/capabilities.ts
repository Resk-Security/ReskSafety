import { api } from "@/lib/api";
import { Shield, Database, Mail, UserCog, Settings, Wrench, Terminal, Eye, type LucideIcon } from "lucide-react";

export interface CapabilityBit {
  bit: number;
  label: string;
  desc: string;
}

export interface CapabilityCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bits: CapabilityBit[];
}

export interface BackendCapability {
  id: string;
  bit_position: number;
  name: string;
  description: string;
}

let cachedCategories: CapabilityCategory[] | null = null;

const BUILTIN_CATEGORIES: Record<number, { category: string; icon: LucideIcon; color: string }> = {
  0: { category: "Tool Access", icon: Terminal, color: "text-blue-500" },
  1: { category: "Tool Access", icon: Terminal, color: "text-blue-500" },
  2: { category: "Data Access", icon: Database, color: "text-emerald-500" },
  3: { category: "Data Access", icon: Database, color: "text-emerald-500" },
  4: { category: "Communication", icon: Mail, color: "text-yellow-500" },
  5: { category: "Privacy", icon: Eye, color: "text-purple-500" },
  6: { category: "Administration", icon: UserCog, color: "text-orange-500" },
  7: { category: "Administration", icon: Settings, color: "text-orange-500" },
};

export async function fetchCapabilities(): Promise<CapabilityCategory[]> {
  if (cachedCategories) return cachedCategories;

  let caps: BackendCapability[];
  try {
    caps = await api.get<BackendCapability[]>("/api/capabilities");
  } catch {
    caps = [];
  }

  if (caps.length === 0) {
    caps = [
      { id: "0", bit_position: 0, name: "can_call_tools", description: "Call functions/tools" },
      { id: "1", bit_position: 1, name: "can_generate_code", description: "Generate executable code" },
      { id: "2", bit_position: 2, name: "db_read", description: "Read database" },
      { id: "3", bit_position: 3, name: "db_write", description: "Write to database" },
      { id: "4", bit_position: 4, name: "can_send_email", description: "Send emails" },
      { id: "5", bit_position: 5, name: "can_access_pii", description: "Access personal data" },
      { id: "6", bit_position: 6, name: "can_manage_users", description: "Manage users" },
      { id: "7", bit_position: 7, name: "can_configure_system", description: "Modify configuration" },
    ];
  }

  const categories = new Map<string, CapabilityCategory>();
  for (const cap of caps) {
    const meta = BUILTIN_CATEGORIES[cap.bit_position] || { category: "Other", icon: Wrench, color: "text-gray-500" };
    if (!categories.has(meta.category)) {
      categories.set(meta.category, {
        id: meta.category.toLowerCase().replace(/\s+/g, "_"),
        label: meta.category,
        icon: meta.icon,
        color: meta.color,
        bits: [],
      });
    }
    categories.get(meta.category)!.bits.push({
      bit: cap.bit_position,
      label: cap.description || cap.name,
      desc: cap.description || cap.name,
    });
  }

  cachedCategories = Array.from(categories.values());
  return cachedCategories;
}

export function clearCapabilitiesCache() {
  cachedCategories = null;
}
