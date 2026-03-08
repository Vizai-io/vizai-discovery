# VizAI Discovery Scanner

Production-ready AI visibility intelligence platform. Built with Next.js 15 (App Router), Firebase, and Genkit.

## Architecture

This application is structured to support both v0.1 (mocked) and future real LLM integrations via a **Provider Adapter Architecture**.

### Key Directories
- `src/ai/flows`: Genkit-defined flows for analysis, report generation, and recommendations.
- `src/lib/services`: Business logic layer.
    - `scan-engine.ts`: Orchestrates the multi-vector audit process.
    - `adapters/`: Contains individual provider logic (OpenAI, Anthropic, Gemini, etc.).
- `src/app/(dashboard)`: Authenticated dashboard environment.
- `src/app/admin`: System-level management.

### AI Integration Layer
To add a real AI provider:
1. Create a new adapter in `src/lib/services/adapters/` (e.g., `openai-adapter.ts`).
2. Implement the `AIProviderAdapter` interface.
3. Register the adapter in `src/lib/services/scan-engine.ts` within the `getActiveAdapters()` method.
4. Add necessary environment variables (e.g., `OPENAI_API_KEY`) to `.env`.

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
3. Configure Environment Variables in `.env`.
4. Run `npm install` and `npm run dev`.
