export type RobotsOutcome = "ALLOWED" | "DISALLOWED" | "UNAVAILABLE" | "UNREACHABLE" | "ERROR";

interface RobotsRule { allow: boolean; pattern: string; specificity: number }
interface RobotsGroup { agents: string[]; rules: RobotsRule[] }

export interface RobotsEvaluation {
  decision: RobotsOutcome;
  permitted: boolean;
  matchedRule?: string;
  reason: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function ruleMatches(path: string, pattern: string): boolean {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const expression = escapeRegex(body).replace(/\*/g, ".*");
  return new RegExp(`^${expression}${endAnchored ? "$" : ""}`).test(path);
}

function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let sawRule = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s*#.*$/, "").trim();
    if (!withoutComment) continue;
    const colon = withoutComment.indexOf(":");
    if (colon < 0) continue;
    const field = withoutComment.slice(0, colon).trim().toLowerCase();
    const value = withoutComment.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }

    if ((field === "allow" || field === "disallow") && current?.agents.length) {
      sawRule = true;
      if (field === "disallow" && value === "") continue;
      current.rules.push({
        allow: field === "allow",
        pattern: value || "/",
        specificity: value.replace(/[\*$]/g, "").length,
      });
    }
  }

  return groups;
}

export function evaluateRobotsText(body: string, targetUrl: string, userAgent: string): RobotsEvaluation {
  const productToken = userAgent.toLowerCase().split(/[\/\s]/, 1)[0];
  const groups = parseRobots(body);
  const exactGroups = groups.filter((group) => group.agents.includes(productToken));
  const matchingGroups = exactGroups.length > 0
    ? exactGroups
    : groups.filter((group) => group.agents.includes("*"));

  if (matchingGroups.length === 0) {
    return { decision: "ALLOWED", permitted: true, reason: "No matching robots user-agent group." };
  }

  const url = new URL(targetUrl);
  const path = `${url.pathname || "/"}${url.search}`;
  const matches = matchingGroups
    .flatMap((group) => group.rules)
    .filter((rule) => ruleMatches(path, rule.pattern))
    .sort((left, right) => right.specificity - left.specificity || Number(right.allow) - Number(left.allow));

  const winner = matches[0];
  if (!winner) {
    return { decision: "ALLOWED", permitted: true, reason: "No robots rule matched the target path." };
  }
  return winner.allow
    ? { decision: "ALLOWED", permitted: true, matchedRule: winner.pattern, reason: "The most specific robots rule allows this path." }
    : { decision: "DISALLOWED", permitted: false, matchedRule: winner.pattern, reason: "The most specific robots rule disallows this path." };
}

export function evaluateRobotsResponse(
  status: number,
  body: string,
  targetUrl: string,
  userAgent: string,
): RobotsEvaluation {
  if (status >= 200 && status < 300) return evaluateRobotsText(body, targetUrl, userAgent);
  if (status >= 400 && status < 500) {
    return {
      decision: "UNAVAILABLE",
      permitted: true,
      reason: `robots.txt returned ${status}; RFC 9309 treats 4xx as unavailable.`,
    };
  }
  if (status >= 500 && status < 600) {
    return {
      decision: "UNREACHABLE",
      permitted: false,
      reason: `robots.txt returned ${status}; crawl fails closed while robots is unreachable.`,
    };
  }
  return { decision: "ERROR", permitted: false, reason: `Unexpected robots.txt response status ${status}.` };
}

export function robotsUrlFor(targetUrl: string): string {
  const target = new URL(targetUrl);
  return new URL("/robots.txt", target.origin).toString();
}
