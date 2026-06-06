import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    config({ path, override: false });
  }
}

const mode = process.env.ENV_CHECK_MODE || process.env.NODE_ENV || 'development';
const isProduction = mode === 'production';

const required = [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENAI_API_KEY',
  'CRON_SECRET',
  'VIZAI_SERVICE_API_KEY',
  'VIZAI_SERVICE_ORG_ID',
];

const productionOnly = ['NEXT_PUBLIC_APP_URL'];

const optionalBilling = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_TIER0_SNAPSHOT_PRICE_ID',
  'STRIPE_TIER1_FOUNDATION_SETUP_PRICE_ID',
  'STRIPE_TIER1_FOUNDATION_MONTHLY_PRICE_ID',
  'STRIPE_TIER2_REINFORCEMENT_SETUP_PRICE_ID',
  'STRIPE_TIER2_REINFORCEMENT_MONTHLY_PRICE_ID',
  'STRIPE_TIER3_GOVERNANCE_SETUP_PRICE_ID',
  'STRIPE_TIER3_GOVERNANCE_MONTHLY_PRICE_ID',
  'STRIPE_ADDON_COMPETITOR_COMPARISON_PRICE_ID',
  'STRIPE_ADDON_EXTENDED_QUERY_PACK_PRICE_ID',
  'STRIPE_ADDON_QUARTERLY_DEEP_AUDIT_PRICE_ID',
  'STRIPE_ADDON_CONTENT_OPTIMIZATION_PAGE_PRICE_ID',
  'STRIPE_ADDON_MULTI_LANGUAGE_TESTING_PRICE_ID',
  'STRIPE_ADDON_PRIORITY_SUPPORT_MONTHLY_PRICE_ID',
  ['STRIPE_PROFESSIONAL_PRICE_ID', 'STRIPE_PRICE_PROFESSIONAL'],
  ['STRIPE_ENTERPRISE_PRICE_ID', 'STRIPE_PRICE_ENTERPRISE'],
];

function isPresent(spec) {
  if (Array.isArray(spec)) {
    return spec.some((name) => Boolean(process.env[name]));
  }
  return Boolean(process.env[spec]);
}

function label(spec) {
  return Array.isArray(spec) ? spec.join(' or ') : spec;
}

function printStatus(title, specs, requiredGroup) {
  console.log(title);
  for (const spec of specs) {
    const present = isPresent(spec);
    const state = present ? 'present' : requiredGroup ? 'missing' : 'not set';
    console.log(`  ${label(spec)}: ${state}`);
  }
}

printStatus('Required', required, true);
if (isProduction) {
  printStatus('Production required', productionOnly, true);
}
printStatus('Optional billing', optionalBilling, false);

const missing = [
  ...required.filter((spec) => !isPresent(spec)),
  ...(isProduction ? productionOnly.filter((spec) => !isPresent(spec)) : []),
];

if (missing.length > 0) {
  console.error(`\nMissing required environment variables for ${mode}:`);
  for (const spec of missing) {
    console.error(`  - ${label(spec)}`);
  }
  process.exit(1);
}

console.log(`\nEnvironment check passed for ${mode}. Secret values were not printed.`);
