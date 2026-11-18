"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readJson } from "./web-client";
import type { PermissionDefinition, RoleRow } from "./roles";
import { humanizeRoleCode } from "./roles";
import {
  DEFAULT_PUBLIC_ACADEMY_CONFIG,
  normalizePublicAcademyConfig,
  type CatalogItemRow,
  type CatalogKey,
  type CatalogMeta,
  type PublicAcademyConfig,
} from "./catalogs";

interface RolesApiResponse {
  roles?: RoleRow[];
  myPermissions?: string[];
  permissionCatalog?: PermissionDefinition[];
  error?: string;
}

interface CatalogsApiResponse {
  items?: CatalogItemRow[];
  config?: PublicAcademyConfig;
  catalogs?: CatalogMeta[];
  error?: string;
}

let activeRolesPromise: Promise<RolesApiResponse> | null = null;
let activeCatalogsPromise: Promise<CatalogsApiResponse> | null = null;

async function fetchRolesDeduplicated(): Promise<RolesApiResponse> {
  if (!activeRolesPromise) {
    activeRolesPromise = fetch("/api/roles", { credentials: "include", cache: "no-store" })
      .then((res) => readJson<RolesApiResponse>(res))
      .finally(() => {
        setTimeout(() => { activeRolesPromise = null; }, 500);
      });
  }
  return activeRolesPromise;
}

async function fetchCatalogsDeduplicated(): Promise<CatalogsApiResponse> {
  if (!activeCatalogsPromise) {
    activeCatalogsPromise = fetch("/api/catalogs", { credentials: "include", cache: "no-store" })
      .then((res) => readJson<CatalogsApiResponse>(res))
      .finally(() => {
        setTimeout(() => { activeCatalogsPromise = null; }, 500);
      });
  }
  return activeCatalogsPromise;
}

export function useRoles(enabled = true) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionDefinition[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRolesDeduplicated();
      if (data.error) throw new Error(data.error);
      setRoles(Array.isArray(data.roles) ? data.roles : []);
      setMyPermissions(Array.isArray(data.myPermissions) ? data.myPermissions : []);
      setPermissionCatalog(Array.isArray(data.permissionCatalog) ? data.permissionCatalog : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Roles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdate = () => void reload();
    window.addEventListener("pw-academy-config-updated", handleUpdate);
    return () => window.removeEventListener("pw-academy-config-updated", handleUpdate);
  }, [reload]);

  const invitableRoles = useMemo(
    () => roles.filter((role) => role.enabled && role.invitable && role.code !== "super_admin"),
    [roles],
  );

  const enabledRoles = useMemo(() => roles.filter((role) => role.enabled), [roles]);

  const roleMap = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const r of roles) map.set(r.code, r);
    return map;
  }, [roles]);

  const can = useCallback(
    (permission: string) => myPermissions.includes("*") || myPermissions.includes(permission),
    [myPermissions],
  );

  const roleLabel = useCallback(
    (code: string) => roleMap.get(code)?.label || humanizeRoleCode(code),
    [roleMap],
  );

  return {
    roles,
    enabledRoles,
    invitableRoles,
    myPermissions,
    permissionCatalog,
    can,
    roleLabel,
    loading,
    error,
    reload,
  };
}

export function useCatalogs(enabled = true) {
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogMeta[]>([]);
  const [config, setConfig] = useState<PublicAcademyConfig>(DEFAULT_PUBLIC_ACADEMY_CONFIG);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCatalogsDeduplicated();
      if (data.error) throw new Error(data.error);
      setItems(Array.isArray(data.items) ? data.items : []);
      setCatalogs(Array.isArray(data.catalogs) ? data.catalogs : []);
      if (data.config) setConfig(normalizePublicAcademyConfig(data.config));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Academy catalogs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUpdate = () => void reload();
    window.addEventListener("pw-academy-config-updated", handleUpdate);
    return () => window.removeEventListener("pw-academy-config-updated", handleUpdate);
  }, [reload]);

  const enabledByCatalog = useCallback(
    (key: CatalogKey) => items.filter((item) => item.catalog === key && item.enabled),
    [items],
  );

  const allByCatalog = useCallback(
    (key: CatalogKey) => items.filter((item) => item.catalog === key),
    [items],
  );

  const labelFor = useCallback(
    (key: CatalogKey, code: string) => {
      const match = items.find((item) => item.catalog === key && item.code === code);
      return match ? match.label : code.replace(/_/g, " ");
    },
    [items],
  );

  return {
    items,
    catalogs,
    config,
    enabledByCatalog,
    allByCatalog,
    labelFor,
    loading,
    error,
    reload,
  };
}
