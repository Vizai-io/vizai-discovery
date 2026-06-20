/**
 * WP-19F-UI — map publish-boundary service errors to HTTP status codes.
 * Pure + shared by the prepare/approve routes; unit-tested.
 */
export function publishErrorStatus(message: string): number {
  const m = (message || "").toLowerCase();
  if (m.includes("not found")) return 404;
  if (m.includes("required")) return 400; // missing prUrl / confirmedContentHash / expectedContentHash
  if (m.includes("drift") || m.includes("mismatch")) return 409; // hash drift / confirmed-hash mismatch
  if (m.includes("must be approved or published") || m.includes("already published")) return 409;
  if (m.includes("must be ready") || m.includes("must be draft")) return 409; // wrong status for external publish
  if (m.includes("gates failed")) return 422; // gate failure -> no write
  if (m.includes("cannot build public profile")) return 422; // e.g. no primaryDomain
  return 500;
}

export const NO_EXTERNAL_PUBLISH_WARNING =
  "This prepares a public registry artifact but does not publish externally.";
