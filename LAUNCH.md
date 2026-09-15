# Launch protections

Deployed September 15, 2026. Existing assistants remain paused.

## Request limits

All Edge Function instances share an atomic database limiter. Limits are fixed windows (UTC epoch boundaries), across every assistant in an organization. Retries count as requests. Changing chat sessions cannot bypass organization limits.

| Action | Per organization/minute | Per organization/day | Per session/minute |
| --- | ---: | ---: | ---: |
| Messages | 60 | 1,000 | 10 |
| History | 1,200 | 100,000 | 30 |
| Configuration | 300 | 20,000 | shared organization allowance |
| Knowledge ingestion | 10 | 100 | 3 per authenticated user |

The limiter reserves capacity before message writes or OpenAI calls and fails closed if unavailable. Ingestion first authenticates and claims the source; a rejected reservation marks that source failed with retry guidance. Existing chunks remain stored, but failed sources are not retrieved until successfully reprocessed.

HTTP 429 includes Retry-After and retry_after seconds. The widget keeps the unsent message, pauses history polling during its cooldown, and prevents early retries from reaching the server. Configurations and history use separate limits from messages. Backend request reads stop after 16,000 bytes for chat and 4,096 bytes for ingestion. OpenAI timeouts, bounded input/output, and safe fallback behavior remain in place.

Counters are in an unexposed private schema, with RLS and no browser grants. Only service_role can call consume_launch_limit. Expired counters are removed in bounded batches during subsequent requests. No raw chat, email, IP address, or session token is stored in counters.

These are request ceilings, not exact dollar budgets or distributed denial-of-service protection. Requests rejected before the limiter still use the Edge gateway and may perform an assistant lookup. Origin checks constrain browsers but are not bot authentication. A hostile caller can consume an organization's public allowance. WAF/CAPTCHA protection and provider billing controls remain separate operational options.

## Monitoring

Supabase Edge Function logs contain widget_request records with a generated trace ID, HTTP status, and duration. The response includes X-Request-Id. widget_ai_fallback and widget_failure events share that trace ID. Search these events in the widget-chat function logs to investigate errors and rate limits. Knowledge ingestion retains sanitized processing errors and ready/failed status in the admin dashboard.

No chat text or credentials are added to diagnostic logs. Logs use Supabase's existing retention; there is no new alert delivery service or monitoring dashboard.

## Access fixes

- Removed browser execution grants on legacy match_knowledge and the invitation trigger function.
- Added a restrictive messages policy requiring its organization to match the referenced conversation, including when other permissive policies allow access.
- Invitation updates require organization-management permission; invitees cannot rewrite their own invitation role or destination organization. Existing signup-trigger acceptance remains available.
- Existing profile role-protection triggers remain in place.

## Verification and remaining findings

12 Node tests passed, including RAG, history, handoff, replay, oversized/invalid requests, rate-limit rejection, and limiter outage. Live concurrent message tests accepted 10 requests and rejected the eleventh with HTTP 429; rejected messages were not persisted. Config, history, human handoff, and unauthenticated ingestion rejection passed. Database checks verified limit enforcement and service-only function grants. Temporary live-test data was deleted.

Security advisors after migration: authenticated SECURITY DEFINER warnings reduced from 8 to 6. The remaining functions are authorization helpers used by existing RLS policies. The vector extension remains in public; moving it requires updating existing vector type/operator references. Leaked-password protection remains disabled and requires Supabase Auth configuration. Four RLS-without-policy notices concern backend-only tables, including the new private counters; browser access remains denied.

Performance advisors still report 10 unindexed foreign keys, 7 auth initialization-plan warnings, 21 overlapping-policy warnings, 5 duplicate-index warnings, and 13 unused-index notices. These existing schema cleanups remain outstanding; this release does not claim a clean project-wide audit.

See [Supabase security advisors](https://supabase.com/docs/guides/database/database-linter) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Deployment

Apply supabase/launch-protection.sql once through migration history, then deploy widget-chat and knowledge-ingest with _shared/rag.mjs. Publish widget.js and the page/snippet cache version 3.4. Limits are backend-defined in the migration function; change them via a reviewed CREATE OR REPLACE migration. Keep all service-role/OpenAI credentials exclusively in Supabase secrets.

