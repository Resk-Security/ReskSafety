import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Capability } from "@/lib/types";

export function useCapabilities() {
  const [caps, setCaps] = useState<Capability[]>([]);
  useEffect(() => {
    api.get<Capability[]>("/api/capabilities").then(setCaps).catch(() => setCaps([]));
  }, []);
  return caps;
}
