# ADR 0001: Private control plane and public registry boundary

Status: accepted

VizAI Discovery is proprietary and contains private evidence, operational
metadata, policies, and review state. `business-registry` contains only
approved public-safe projections.

Publication is one directional. The application prepares an artifact, but a
human-reviewed pull request and the public repository CI remain mandatory.
Workers and service keys cannot merge or bypass publication approval.
