import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setCsrf } from "./api";
import { clearCsrf } from "./api";
import type { MeResponse } from "./types";

interface AuthCtx {
  user: MeResponse | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ user: MeResponse; csrf_token: string }>("/api/auth/me");
        setCsrf(data.csrf_token);
        setUser(data.user);
      } catch {
        try {
          const data = await api.post<{ user: MeResponse; csrf_token: string }>("/api/auth/login", {
            username: "demo",
            password: "demo1234",
          });
          setCsrf(data.csrf_token);
          setUser(data.user);
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(username: string, password: string) {
    const data = await api.post<{ user: MeResponse; csrf_token: string }>("/api/auth/login", {
      username,
      password,
    });
    setCsrf(data.csrf_token);
    setUser(data.user);
  }

  async function logout() {
    await api.post("/api/auth/logout");
    clearCsrf();
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
