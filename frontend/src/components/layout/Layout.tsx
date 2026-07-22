import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { DemoBanner } from "./DemoBanner";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 pt-14 relative">
        <DemoBanner />
        {children}
      </main>
    </div>
  );
}
