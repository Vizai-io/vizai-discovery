# Current architecture

VizAI Discovery is the private application and governance plane.

```text
Browser
  -> Next.js API and server components
  -> Supabase Auth
  -> Prisma/PostgreSQL

Registry API
  -> registry crawl run
  -> pg-boss queue
  -> persistent worker
  -> bounded/robots-aware acquisition
  -> private content-addressed snapshot storage
  -> evidence and operator review
  -> clean publication candidate
  -> human pull request
  -> public business-registry CI
```

The Supabase browser roles have no direct privileges on application tables.
All tenant access is mediated by authenticated server routes and organization
filters. Row Level Security remains enabled as defense in depth.

The web process does not run persistent crawl work. The worker has separate
runtime configuration, health probes, and queue credentials.
