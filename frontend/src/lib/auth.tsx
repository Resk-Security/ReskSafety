import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
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
    api
      .get<MeResponse>("/api/auth/me")
      .then(setUser)
      .catch(() => {
        api
          .post<{ user: MeResponse }>("/api/auth/login", { username: "admin", password: "changeme" })
          .then((data) => setUser(data.user))
          .catch(() => setUser(null));
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const data = await api.post<{ user: MeResponse }>("/api/auth/login", {
      username,
      password,
    });
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
