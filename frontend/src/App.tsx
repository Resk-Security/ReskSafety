import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout/Layout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Users } from "@/pages/Users";
import { Roles } from "@/pages/Roles";
import { Policies } from "@/pages/Policies";
import { PolicyDetail } from "@/pages/PolicyDetail";
import { PolicyRules } from "@/pages/PolicyRules";
import { PolicySemanticDetection } from "@/pages/PolicySemanticDetection";
import { PolicyAccessControl } from "@/pages/PolicyAccessControl";
import { PolicyClassifiers } from "@/pages/PolicyClassifiers";
import { ScanningPipeline } from "@/pages/ScanningPipeline";
import { Logs } from "@/pages/Logs";
import { Providers } from "@/pages/Providers";
import { ProviderModels } from "@/pages/ProviderModels";
import { McpServersPage } from "@/pages/McpServersPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { Observability } from "@/pages/Observability";
import { Settings } from "@/pages/Settings";
import { UserSessions } from "@/pages/UserSessions";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="flex h-screen items-center justify-center text-muted-foreground">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/users" element={<Protected><Users /></Protected>} />
          <Route path="/users/:userId/sessions" element={<Protected><UserSessions /></Protected>} />
          <Route path="/roles" element={<Protected><Roles /></Protected>} />
          <Route path="/policies" element={<Protected><Policies /></Protected>} />
          <Route path="/policies/new" element={<Protected><PolicyDetail /></Protected>} />
          <Route path="/policies/:id" element={<Protected><PolicyDetail /></Protected>} />
          <Route path="/policies/rules" element={<Protected><PolicyRules /></Protected>} />
          <Route path="/policies/semantic-detection" element={<Protected><PolicySemanticDetection /></Protected>} />
          <Route path="/policies/access-control" element={<Protected><PolicyAccessControl /></Protected>} />
          <Route path="/policies/classifiers" element={<Protected><PolicyClassifiers /></Protected>} />
          <Route path="/policies/scanning-pipeline" element={<Protected><ScanningPipeline /></Protected>} />
          <Route path="/policies/:id/semantic-detection" element={<Protected><PolicySemanticDetection /></Protected>} />
          <Route path="/policies/:id/access-control" element={<Protected><PolicyAccessControl /></Protected>} />
          <Route path="/policies/:id/classifiers" element={<Protected><PolicyClassifiers /></Protected>} />
          <Route path="/providers" element={<Protected><Providers /></Protected>} />
          <Route path="/providers/:providerId/models" element={<Protected><ProviderModels /></Protected>} />
          <Route path="/integrations/mcp" element={<Protected><McpServersPage /></Protected>} />
          <Route path="/memory" element={<Protected><MemoryPage /></Protected>} />
          <Route path="/observability" element={<Protected><Observability /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/logs" element={<Protected><Logs /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
