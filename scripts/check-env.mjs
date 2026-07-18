import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false });
}

const mode = process.env.ENV_CHECK_MODE || process.env.NODE_ENV || 'development';
const role = process.env.ENV_CHECK_ROLE || 'web';
const isProduction = mode === 'production';

const common = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'RATE_LIMIT_HASH_SECRET',
  ['OPENAI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
];
const web = isProduction ? ['NEXT_PUBLIC_APP_URL'] : [];
const worker = [
  'REGISTRY_QUEUE_DATABASE_URL',
  'REGISTRY_SNAPSHOT_BACKEND',
  'REGISTRY_SNAPSHOT_BUCKET',
];
const migration = ['DIRECT_URL'];

const requiredByRole = {
  web: [...common, ...web],
  worker: [...common, ...worker],
  migration: [...common, ...migration],
  all: [...common, ...web, ...worker, ...migration],
};

if (!(role in requiredByRole)) {
  console.error(`Unknown ENV_CHECK_ROLE "${role}". Use web, worker, migration, or all.`);
  process.exit(1);
}

const optional = [
  'DATABASE_CA_CERT',
  'VIZAI_SERVICE_API_KEY',
  'VIZAI_SERVICE_ORG_ID',
  'CLOUDFLARE_TURNSTILE_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

function isPresent(spec) {
  return Array.isArray(spec)
    ? spec.some((name) => Boolean(process.env[name]))
    : Boolean(process.env[spec]);
}

function label(spec) {
  return Array.isArray(spec) ? spec.join(' or ') : spec;
}

const required = [...new Map(requiredByRole[role].map((spec) => [label(spec), spec])).values()];
console.log(`Environment role: ${role} (${mode})`);
for (const spec of required) {
  console.log(`  ${label(spec)}: ${isPresent(spec) ? 'present' : 'missing'}`);
}
for (const spec of optional) {
  console.log(`  ${spec}: ${isPresent(spec) ? 'present' : 'not set'}`);
}

const missing = required.filter((spec) => !isPresent(spec));
if (missing.length > 0) {
  console.error(`\nMissing required environment variables for ${role}:`);
  for (const spec of missing) console.error(`  - ${label(spec)}`);
  process.exit(1);
}

if (isProduction && role !== 'web' && process.env.REGISTRY_QUEUE_MIGRATE !== 'false') {
  console.error('\nProduction workers must set REGISTRY_QUEUE_MIGRATE=false after the release migration step.');
  process.exit(1);
}

console.log('\nEnvironment check passed. Secret values were not printed.');
