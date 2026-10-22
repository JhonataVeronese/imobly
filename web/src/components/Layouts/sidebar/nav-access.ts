import type { AuthMe } from "@/types/auth-session";
import type { NavAccessLevel, NavSection } from "./types";
import { NAV_DATA } from "./data";

function canSee(access: NavAccessLevel | undefined, me: AuthMe | null): boolean {
  const level = access ?? "all";
  if (level === "all") return true;
  if (!me) return false;
  if (level === "super") return me.isSuper === true;
  if (level === "admin") return me.isSuper === true || me.perfil === "admin";
  return false;
}

function hasModule(
  moduleCodes: string[] | undefined,
  me: AuthMe | null,
): boolean {
  if (!moduleCodes || moduleCodes.length === 0) return true;
  if (!me || me.isSuper) return true;
  const owned = new Set(me.moduloCodigos ?? []);
  return moduleCodes.some((code) => owned.has(code));
}

function navItemVisible(
  item: {
    tenantScopeOnly?: boolean;
    superOnly?: boolean;
    access?: NavAccessLevel;
    moduleCodes?: string[];
  },
  me: AuthMe | null,
): boolean {
  if (!canSee(item.access, me)) return false;
  if (item.superOnly && !me?.isSuper) return false;
  if (item.tenantScopeOnly && me?.isSuper) return false;
  if (!hasModule(item.moduleCodes, me)) return false;
  return true;
}

function subItemVisible(
  sub: {
    tenantScopeOnly?: boolean;
    access?: NavAccessLevel;
    moduleCodes?: string[];
  },
  me: AuthMe | null,
): boolean {
  if (!canSee(sub.access, me)) return false;
  if (sub.tenantScopeOnly && me?.isSuper) return false;
  if (!hasModule(sub.moduleCodes, me)) return false;
  return true;
}

/** Filtra seções e itens conforme perfil e módulos da assinatura. */
export function filterNavForSession(me: AuthMe | null): NavSection[] {
  const out: NavSection[] = [];
  for (const section of NAV_DATA) {
    if (!canSee(section.access, me)) continue;
    const items = section.items
      .filter((item) => navItemVisible(item, me))
      .map((item) => ({
        ...item,
        items: item.items.filter((subItem) => subItemVisible(subItem, me)),
      }))
      .filter((item) => item.items.length > 0 || Boolean(item.url));
    if (items.length === 0) continue;
    out.push({ ...section, items });
  }
  return out;
}
