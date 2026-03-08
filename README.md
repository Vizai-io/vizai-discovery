# VizAI Discovery Scanner

Production-ready AI visibility intelligence platform. Built with Next.js 15 (App Router), Firebase, and Genkit.

## Architecture

This application is structured to support both v0.1 (mocked) and future real LLM integrations.

### Key Directories
- `src/ai/flows`: Genkit-defined flows for analysis, report generation, and recommendations.
- `src/lib/services`: Business logic layer.
    - `scan-engine.ts`: Orchestrates LLM calls (mocked for now).
- `src/app/(dashboard)`: Authenticated dashboard environment.
- `src/app/admin`: System-level management.

### Firestore Schema

#### `organizations`
- `id`: string (UUID)
- `name`: string
- `createdAt`: timestamp

#### `users`
- `uid`: string (Firebase Auth UID)
- `organizationId`: string (Ref to organization)
- `role`: 'admin' | 'client'
- `email`: string

#### `companyProfiles`
- `id`: string
- `organizationId`: string
- `name`: string
- `website`: string
- `industry`: string
- `serviceCategories`: string[]
- `targetGeography`: string
- `competitors`: string[]

#### `scans`
- `id`: string
- `profileId`: string
- `organizationId`: string
- `date`: timestamp
- `results`: object (Contains scores, category breakdowns, gaps, etc.)

## Getting Started

1. Set up a Firebase Project.
2. Enable Authentication (Email/Password) and Firestore.
3. Configure Environment Variables:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
4. Run `npm install` and `npm run dev`.

## Future LLM Integrations

To connect to real AI providers:
1. Update `src/ai/genkit.ts` with your API keys for OpenAI/Google/Anthropic.
2. Modify the Genkit prompts in `src/ai/flows/` to use real scraping or RAG techniques for gathering company data from the web.
3. Implement `providerAdapters` in `src/lib/services/scan-engine.ts` to fetch raw LLM responses for comparison.
