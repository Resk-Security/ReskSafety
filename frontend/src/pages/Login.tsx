import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await login(username, password);
      navigate("/");
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center relative">
      <div className="fixed top-0 left-0 w-full bg-amber-500 text-amber-950 text-xs font-semibold text-center py-1 z-50">
        DÉMO — Interface administrateur RESK (frontend uniquement)
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>RESK admin login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u">Username</Label>
              <Input
                id="u"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">Password</Label>
              <Input
                id="p"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {err && <div className="text-destructive text-sm">{err}</div>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "…" : "Login"}
            </Button>
            <div className="text-xs text-muted-foreground">
              Default: <code>admin</code> / <code>changeme</code>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
