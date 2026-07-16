import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SnapshotObject {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface SnapshotStoreResult {
  key: string;
  created: boolean;
}

export interface SnapshotStore {
  putIfAbsent(object: SnapshotObject): Promise<SnapshotStoreResult>;
}

function safeIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) {
    throw new Error(`${label} contains characters that are unsafe for a snapshot object key.`);
  }
  return value;
}

function safeDigest(value: string, label: string): string {
  const digest = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${label} must be a SHA-256 hex digest.`);
  }
  return digest;
}

function safeExtension(value: string): string {
  if (!/^[a-z0-9]{1,10}$/.test(value)) throw new Error("Snapshot extension is invalid.");
  return value;
}

export function snapshotObjectKey(input: {
  organizationId: string;
  targetId: string;
  urlHash: string;
  contentHash: string;
  extension?: string;
}): string {
  return [
    safeIdentifier(input.organizationId, "organizationId"),
    safeIdentifier(input.targetId, "targetId"),
    safeDigest(input.urlHash, "urlHash"),
    `${safeDigest(input.contentHash, "contentHash")}.${safeExtension(input.extension ?? "bin")}`,
  ].join("/");
}

export class LocalSnapshotStore implements SnapshotStore {
  constructor(private readonly root: string) {}

  async putIfAbsent(object: SnapshotObject): Promise<SnapshotStoreResult> {
    const absolute = join(this.root, ...object.key.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    try {
      await writeFile(absolute, object.body, { flag: "wx" });
      return { key: object.key, created: true };
    } catch (error: any) {
      if (error?.code === "EEXIST") return { key: object.key, created: false };
      throw error;
    }
  }
}

export class SupabaseSnapshotStore implements SnapshotStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async putIfAbsent(object: SnapshotObject): Promise<SnapshotStoreResult> {
    const result = await this.client.storage.from(this.bucket).upload(object.key, object.body, {
      contentType: object.contentType,
      upsert: false,
      metadata: object.metadata,
    });
    if (!result.error) return { key: object.key, created: true };
    if (/already exists|duplicate/i.test(result.error.message)) {
      return { key: object.key, created: false };
    }
    throw new Error(`Snapshot upload failed: ${result.error.message}`);
  }
}

export function createSnapshotStore(): SnapshotStore {
  const backend = process.env.REGISTRY_SNAPSHOT_BACKEND ??
    (process.env.NODE_ENV === "production" ? "supabase" : "local");
  if (backend === "local") {
    return new LocalSnapshotStore(
      process.env.REGISTRY_SNAPSHOT_LOCAL_DIR ?? join(process.cwd(), ".registry-snapshots"),
    );
  }
  if (backend === "supabase") {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Registry snapshots.");
    }
    return new SupabaseSnapshotStore(
      createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      process.env.REGISTRY_SNAPSHOT_BUCKET ?? "registry-snapshots",
    );
  }
  throw new Error(`Unsupported REGISTRY_SNAPSHOT_BACKEND: ${backend}`);
}
