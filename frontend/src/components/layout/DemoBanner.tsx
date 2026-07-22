import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPage, getVisitorId } from "@/lib/tracker";

export function DemoBanner() {
  const loc = useLocation();

  useEffect(() => { trackPage(); }, [loc.pathname]);

  return (
    <div className="fixed top-0 left-0 w-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-amber-950 text-xs font-semibold text-center py-1 z-50 flex items-center justify-center gap-3">
      <span>⚡ DÉMO — RESK Admin</span>
      <span className="opacity-60">·</span>
      <span className="opacity-70 font-normal">admin / changeme</span>
      <span className="opacity-50 text-[10px]">visitor: {getVisitorId()?.slice(0, 8)}</span>
    </div>
  );
}
