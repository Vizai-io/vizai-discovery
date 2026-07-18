# Contributing

Changes are made through short-lived branches and pull requests. Direct pushes
to `main` are not part of the release process.

Before requesting review, run:

```text
npm ci
npm run ci:verify
```

Database changes require a forward-only Prisma migration and a rollback or
operational recovery note. Registry publication and autonomy changes require
an explicit security, privacy, and human-approval review.
