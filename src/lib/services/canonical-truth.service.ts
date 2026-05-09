/**
 * @fileOverview CanonicalTruthService (Phase 2.2)
 *
 * The single operational bridge between CompanyProfile (canonical truth source)
 * and the publishing + drift detection systems.
 *
 * Refinement 1: CompanyProfile.official* fields ARE the canonical truth.
 * This service reads and operationalizes them — it never duplicates or shadows them.
 *
 * Responsibilities:
 *  - Build normalized canonical profiles from CompanyProfile
 *  - Manage draft/publish lifecycle (DRAFT → PUBLISHED → SUPERSEDED)
 *  - Dedup: same hash = no new publish needed
 *  - Generate versioned export payloads
 *  - Optionally push to GitHub on confirm (non-fatal, fire-and-forget)
 *
 * Rules:
 *  - NO mutations to CompanyProfile
 *  - NO AI-generated truth content
 *  - NO inferred claims
 *  - NO silent publishing
 *  - All publishing requires explicit confirmPublish() call
 *  - GitHub push is optional and non-fatal (refinement 6)
 */

import { db } from "@/lib/db";
import { TruthPublishRepository } from "@/lib/repositories/truth-publish.repository";
import {
  TruthExportService,
  buildCanonicalBusiness,
  type CanonicalExportPayload,
  type CanonicalBusiness,
} from "./truth-export.service";
import type { TruthPublishRecord } from "@prisma/client";

// ── Public types ───────────────────────────────────────────────────────────────

export type CanonicalProfile = {
  organization_id: string;
  profile_id: string;
  business_name: string;
  business: CanonicalBusiness;
};

export type DraftState = {
  record: TruthPublishRecord;
  /** true when payload hash matches last PUBLISHED record — no changes since last publish */
  upToDate: boolean;
  lastPublished: TruthPublishRecord | null;
};

export type GitHubPushResult = {
  pushed: boolean;
  error?: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const CanonicalTruthService = {
  /**
   * Retrieve the organization's active CompanyProfile as a normalized canonical profile.
   * Returns null if no active profile exists.
   */
  async getCanonicalProfile(organizationId: string): Promise<CanonicalProfile | null> {
    const profile = await db.companyProfile.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" }, // deterministic — oldest primary profile
    });

    if (!profile) return null;

    return {
      organization_id: organizationId,
      profile_id: profile.id,
      business_name: profile.businessName,
      business: buildCanonicalBusiness(profile),
    };
  },

  /**
   * Get or create a DRAFT TruthPublishRecord for the active profile.
   *
   * If a DRAFT already exists — refresh its payload with current canonical truth.
   * If no DRAFT — create one with the next version number.
   *
   * Returns the draft state including whether it's up-to-date with last published.
   */
  async getOrCreateDraft(
    organizationId: string,
  ): Promise<DraftState | null> {
    const canonical = await this.getCanonicalProfile(organizationId);
    if (!canonical) return null;

    const { profile_id } = canonical;
    const now = new Date().toISOString();

    const currentHash = TruthExportService.computeHash(canonical.business);
    const lastPublished = await TruthPublishRepository.findLatestPublished(profile_id);

    let draft = await TruthPublishRepository.findDraft(profile_id);

    if (draft) {
      // Refresh payload in case canonical truth changed since draft was created
      const nextVersion = draft.version;
      const payload = TruthExportService.buildPayload(
        organizationId,
        profile_id,
        nextVersion,
        canonical.business,
        now,
      );
      draft = await TruthPublishRepository.refreshDraft(
        draft.id,
        payload,
        currentHash,
      );
    } else {
      const version = await TruthPublishRepository.nextVersion(profile_id);
      const payload = TruthExportService.buildPayload(
        organizationId,
        profile_id,
        version,
        canonical.business,
        now,
      );
      draft = await TruthPublishRepository.createDraft({
        organizationId,
        companyProfileId: profile_id,
        version,
        exportPayload: payload,
        payloadHash: currentHash,
      });
    }

    const upToDate = !!lastPublished && lastPublished.payloadHash === currentHash;

    return { record: draft, upToDate, lastPublished };
  },

  /**
   * Confirm publish: DRAFT → PUBLISHED.
   * Previous PUBLISHED record → SUPERSEDED.
   * Optionally push to GitHub (non-fatal).
   *
   * Caller must verify the record belongs to the organization before calling.
   */
  async confirmPublish(
    recordId: string,
    organizationId: string,
  ): Promise<{ record: TruthPublishRecord; github: GitHubPushResult }> {
    // Resolve the draft
    const draft = await db.truthPublishRecord.findFirst({
      where: { id: recordId, organizationId, status: "DRAFT" },
    });

    if (!draft) {
      throw new Error("Draft not found or already published.");
    }

    // Transition DRAFT → PUBLISHED (atomic, previous PUBLISHED → SUPERSEDED)
    const published = await TruthPublishRepository.confirmPublish(
      recordId,
      draft.companyProfileId,
    );

    // Optional GitHub push — fire-and-forget, non-fatal (refinement 6)
    const github = await this._tryGitHubPush(organizationId, published);

    return { record: published, github };
  },

  /**
   * Generate an export string for the organization's current canonical truth.
   * Produces the current canonical truth without creating a publish record.
   */
  async generateExport(
    organizationId: string,
    format: "json" | "markdown",
  ): Promise<{ content: string; filename: string } | null> {
    const canonical = await this.getCanonicalProfile(organizationId);
    if (!canonical) return null;

    const lastPublished = await TruthPublishRepository.findLatestPublished(
      canonical.profile_id,
    );
    const version = lastPublished ? lastPublished.version : 0;

    const payload = TruthExportService.buildPayload(
      organizationId,
      canonical.profile_id,
      version,
      canonical.business,
      new Date().toISOString(),
    );

    if (format === "markdown") {
      return {
        content: TruthExportService.toMarkdown(payload),
        filename: "canonical-truth.md",
      };
    }

    return {
      content: TruthExportService.toJSON(payload),
      filename: "canonical-truth.json",
    };
  },

  /**
   * Get a summary of the organization's publishing state.
   * Used by the publishing panel and the canonical-truth API.
   */
  async getPublishingState(organizationId: string): Promise<{
    canonical: CanonicalProfile | null;
    draft: DraftState | null;
    history: TruthPublishRecord[];
  }> {
    const canonical = await this.getCanonicalProfile(organizationId);
    if (!canonical) {
      return { canonical: null, draft: null, history: [] };
    }

    const [draft, history] = await Promise.all([
      this.getOrCreateDraft(organizationId),
      TruthPublishRepository.findHistory(canonical.profile_id, 5),
    ]);

    return { canonical, draft, history };
  },

  // ── Private: GitHub push ──────────────────────────────────────────────────

  /**
   * Attempt to push canonical truth to GitHub.
   * Non-fatal — always returns a GitHubPushResult.
   * Refinement 5 & 6: push-only, failure never blocks publish, failure explained calmly.
   */
  async _tryGitHubPush(
    organizationId: string,
    record: TruthPublishRecord,
  ): Promise<GitHubPushResult> {
    try {
      const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { githubRepoUrl: true, githubDefaultBranch: true },
      });

      if (!org?.githubRepoUrl) {
        return { pushed: false };
      }

      const pat = process.env.GITHUB_PAT;
      if (!pat) {
        return { pushed: false, error: "GITHUB_PAT environment variable not configured." };
      }

      const payload = record.exportPayload as CanonicalExportPayload;
      const branch = org.githubDefaultBranch ?? "main";

      await _pushFilesToGitHub({
        repoUrl: org.githubRepoUrl,
        branch,
        pat,
        files: [
          {
            path: "vizai-truth/canonical-truth.json",
            content: TruthExportService.toJSON(payload),
          },
          {
            path: "vizai-truth/canonical-truth.md",
            content: TruthExportService.toMarkdown(payload),
          },
        ],
        message: `VizAI canonical truth — version ${record.version}`,
      });

      return { pushed: true };
    } catch (err: any) {
      console.error("[canonical-truth] GitHub push failed (non-fatal):", err.message);
      return { pushed: false, error: err.message };
    }
  },
} as const;

// ── GitHub push implementation ─────────────────────────────────────────────────

type GitHubFile = { path: string; content: string };

/**
 * Push files to a GitHub repository via the GitHub Contents API.
 * Each file is upserted: fetches current SHA (if exists), then creates or updates.
 *
 * Boundary discipline (refinement 5, 9):
 *  - VizAI → GitHub only
 *  - No polling, no ingestion, no webhooks
 *  - Pure push-only operation
 */
async function _pushFilesToGitHub(opts: {
  repoUrl: string;
  branch: string;
  pat: string;
  files: GitHubFile[];
  message: string;
}): Promise<void> {
  const { repoUrl, branch, pat, files, message } = opts;

  // Parse owner/repo from URL
  // Supports: https://github.com/owner/repo or github.com/owner/repo
  const match = repoUrl.replace(/^https?:\/\//, "").match(/^github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Invalid GitHub repo URL: ${repoUrl}`);
  }
  const [, owner, repo] = match;

  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  for (const file of files) {
    const url = `${apiBase}/${file.path}`;

    // Fetch current file SHA (required for updates — create doesn't need it)
    let sha: string | undefined;
    const existing = await fetch(`${url}?ref=${branch}`, { headers });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }

    const body: Record<string, string> = {
      message,
      content: Buffer.from(file.content, "utf-8").toString("base64"),
      branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `GitHub API error for ${file.path}: ${res.status} ${err.message ?? res.statusText}`,
      );
    }
  }
}
