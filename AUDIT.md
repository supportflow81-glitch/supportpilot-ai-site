# Database audit cleanup — September 15, 2026

Applied `supabase/audit-cleanup.sql` to production through the migration `resolve_database_security_and_performance_advisors`.

## Changes

- Moved the six privileged authorization implementations into `servelink_private`, with fixed empty search paths and explicit authenticated/service-role grants. Public compatibility functions now use SECURITY INVOKER. Each implementation still checks the current authenticated user's identity and membership; callers cannot supply another identity.
- Retained one organization-access policy per operation by removing redundant member policies. Removed the obsolete knowledge-chunk write policy; ingestion remains service-only. Public-facing policies now explicitly target authenticated users.
- Wrapped seven policies' user/JWT lookups in SELECT so PostgreSQL can evaluate them once per statement.
- Added ten foreign-key indexes and removed five identical duplicate indexes. Useful inbox, foreign-key, and vector indexes remain despite low-traffic unused-index notices.
- Added explicit service-only policies on backend operational tables and revoked browser grants.
- Moved the existing vector extension from public to extensions. Updated retrieval and ingestion search paths. This preserves type OIDs, indexes, embeddings, and the 1536-dimensional column. No re-embedding is required.

Apply this migration after the prior RAG, widget lifecycle, and launch-protection SQL. Earlier SQL files describe the historical schema before relocation; current database tests use `extensions.vector`.

## Verification

The transaction tests in `tests/rag-transaction.sql` and `tests/audit-access.sql` passed on production, rolling back all fixtures. They verify atomic replacement, stale-job rejection, busy claims, malformed embedding rejection, organization/assistant isolation, member and outsider permissions, profile role-escalation denial, invitation-update denial, and private counter/RPC restrictions.

After the migration, security advisors reported only leaked-password protection disabled. Performance advisors reported only informational unused-index notices; no performance warnings or missing foreign-key indexes remain. Index usage depends on production traffic and is not a reason to discard necessary indexes.

## Remaining Auth setting

Live API verification also passed: question embedding, vector retrieval, and the production Responses API returned the correct fictional diagnostic fee. The REST API rejected the private schema. Temporary live-test data was removed; all three existing assistants remain paused.

Leaked-password protection requires a signed-in Supabase dashboard session and the Pro plan or above. The connected database tools cannot change this Auth setting. Enable it in project Authentication settings once dashboard access and plan eligibility are confirmed. No paid upgrade has been made.

References: [Supabase database advisors](https://supabase.com/docs/guides/database/database-linter), [password protection requirements](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

