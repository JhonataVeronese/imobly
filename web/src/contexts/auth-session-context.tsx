"use client";

import type { AuthMe } from "@/types/auth-session";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type AuthSessionState = {
  me: AuthMe | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionState | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
        setError(res.status === 401 ? null : `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as AuthMe;
      setMe(data);
      setError(null);
    } catch {
      setMe(null);
      setError("Falha ao carregar sessão");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({ me, loading, error, refresh }),
    [me, loading, error, refresh],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionState {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuthSession deve ser usado dentro de AuthSessionProvider");
  }
  return ctx;
}

/** Parceiro ativo para UI e validação (espelha cookie / sessão no servidor). */
export function useTenantContext() {
  const { me, loading } = useAuthSession();
  return {
    activeTenantId: me?.activeTenantId ?? null,
    tenantHomeId: me?.tenantHomeId ?? null,
    isSuper: me?.isSuper ?? false,
    perfil: me?.perfil ?? null,
    /** Há escopo de parceiro para rotas que exigem `X-Tenant-Id`. */
    hasTenantScope: Boolean(me?.activeTenantId?.trim()),
    loading,
  };
}
