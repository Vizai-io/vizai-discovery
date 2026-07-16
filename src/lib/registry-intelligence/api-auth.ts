import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/get-auth-context";
import {
  hasRegistryScope,
  registryScopeError,
  type RegistryScope,
} from "@/lib/auth/registry-scope";

export type RegistryAuthorization =
  | { ok: true; auth: AuthContext }
  | { ok: false; response: NextResponse };

export async function authorizeRegistryRequest(required: RegistryScope): Promise<RegistryAuthorization> {
  const auth = await getAuthContext();
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (auth.organizationId === "unassigned") {
    return { ok: false, response: NextResponse.json({ error: "Organization assignment required." }, { status: 403 }) };
  }
  if (!hasRegistryScope(auth, required)) {
    return { ok: false, response: NextResponse.json(registryScopeError(required), { status: 403 }) };
  }
  return { ok: true, auth };
}
