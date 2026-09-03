# Agentic Outreach Reference Implementation

Keep the outreach domain in `src/outreach/` framework-agnostic and preserve the control boundary: AI produces analysis and drafts; only the application service can approve or execute; only mock delivery is allowed.

Before publishing changes, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

Use fictional data only. Do not add authentication, external providers, real email delivery, scraping, or unrelated product features.
