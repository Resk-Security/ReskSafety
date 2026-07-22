import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 pt-14 relative">
        <div className="fixed top-0 left-0 w-full bg-amber-500 text-amber-950 text-xs font-semibold text-center py-1 z-50">
          DÉMO — Interface administrateur RESK (frontend uniquement)
        </div>
        {children}
      </main>
    </div>
  );
}
