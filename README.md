
# VizAI Discovery Scanner

Production-ready AI visibility intelligence platform. Built with Next.js 15 (App Router), Firebase, and Genkit.

## Canonical Route Map

### External / Marketing
- `/` : Landing Page
- `/auth/sign-in` : Authenticated access portal
- `/demo` : Sandbox industry selector
- `/free-scan` : Lead generation teaser audit
- `/share/[id]` : Secure read-only presentation for clients

### User Command Center
- `/dashboard` : Portfolio intelligence summary
- `/scans` : Historical inventory of all audits
- `/scans/new` : Setup wizard for new entity scans
- `/scans/[id]` : In-depth discovery analytics and fidelity scores
- `/scans/[id]/report` : Internal-professional audit report
- `/companies` : Management of corporate entity signal profiles
- `/rankings` : Market benchmarking and sector leaderboards
- `/recommendations` : Strategic action center
- `/monitoring` : Automated tracking schedules
- `/history` : Chronological timeline of visibility drift

### Administrative Hub
- `/admin` : System health and seeding controls
- `/admin/leads` : Consultation intake and sales pipeline
- `/admin/scans/[id]/review` : Human quality control & anonymization
- `/admin/scans/[id]/proposal` : Commercial roadmap builder

## Core Architecture

This application uses a **Provider Adapter Architecture** to facilitate hybrid intelligence—balancing deterministic high-volume simulations with live AI model verification via Gemini 1.5 Flash.

### Key Data Entities
- `organizations`: Enterprise accounts.
- `users`: IAM and role-based access.
- `companyProfiles`: The digital twins of brands being audited.
- `scans`: Multi-vector discovery records containing analytics and real AI validation.
- `consultationRequests`: Lead intake from the free scan funnel.
- `discoveryDataset`: Long-term repository for trend analysis.
