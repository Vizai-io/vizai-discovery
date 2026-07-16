import type { AuthContext } from "@/lib/auth/get-auth-context";

export const REGISTRY_SCOPES = [
  "registry:read",
  "registry:run",
  "registry:review",
  "registry:policy",
  "registry:publish",
] as const;

export type RegistryScope = (typeof REGISTRY_SCOPES)[number];

/**
 * Session users retain the product's role model. Service callers are always
 * explicit-scope: an ADMIN service key is not automatically a registry admin.
 */
export function hasRegistryScope(auth: AuthContext, required: RegistryScope): boolean {
  if (auth.authMode === "session") {
    if (auth.role === "ADMIN") return true;
    return required === "registry:read";
  }

  return auth.scopes.includes("*") || auth.scopes.includes(required);
}

export function registryScopeError(required: RegistryScope): {
  error: string;
  required_scope: RegistryScope;
} {
  return {
    error: "The authenticated service key does not grant this Registry Intelligence capability.",
    required_scope: required,
  };
}
