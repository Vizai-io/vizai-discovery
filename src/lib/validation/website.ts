/**
 * @fileOverview Business website validation.
 *
 * A perception scan needs a real business website. Social media profiles,
 * video platforms, marketplaces and link-in-bio pages are not business
 * websites — the models have no business site to evaluate, so the scan
 * produces meaningless results (e.g. scanning a TikTok profile URL).
 *
 * Used by the public free-scan endpoint, the lmo-backend intake, and the
 * authenticated scan API. Keep the blocklist to platforms whose URLs can
 * never be a business's own website (a business's own domain is never a
 * subdomain of tiktok.com, amazon.com, etc.).
 */

const SOCIAL_AND_PLATFORM_DOMAINS = new Set([
  // Social media
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "snapchat.com",
  "reddit.com",
  "tumblr.com",
  "twitch.tv",
  "threads.net",
  "mastodon.social",
  "bsky.app",
  "discord.com",
  "discord.gg",
  "whatsapp.com",
  "wa.me",
  "telegram.me",
  "t.me",
  // Video / content platforms
  "vimeo.com",
  "dailymotion.com",
  "rumble.com",
  // Link-in-bio / creator pages
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "carrd.co",
  "bio.link",
  // Marketplaces (a listing page is not the business's own website)
  "amazon.com",
  "amazon.ca",
  "ebay.com",
  "ebay.ca",
  "etsy.com",
  // Review / directory sites (a listing, not the business site)
  "yelp.com",
  "tripadvisor.com",
  "google.com",
]);

export function getHostname(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isSocialOrPlatform(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "");
  if (SOCIAL_AND_PLATFORM_DOMAINS.has(host)) return true;
  for (const d of SOCIAL_AND_PLATFORM_DOMAINS) {
    if (host.endsWith(`.${d}`)) return true;
  }
  return false;
}

export function validateBusinessWebsite(rawUrl: string): {
  valid: boolean;
  reason?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, reason: "A website address is required." };
  }
  const hostname = getHostname(rawUrl.trim());
  if (!hostname) {
    return { valid: false, reason: "That doesn't look like a valid website address." };
  }
  if (isSocialOrPlatform(hostname)) {
    return {
      valid: false,
      reason:
        "That looks like a social media or marketplace link. Please enter your business website address (for example, yourcompany.com) — not a social media profile.",
    };
  }
  const host = hostname.replace(/^www\./, "");
  if (!host.includes(".") || (host.split(".").pop() ?? "").length < 2) {
    return {
      valid: false,
      reason: "Please enter a full website address, for example yourcompany.com.",
    };
  }
  return { valid: true };
}
