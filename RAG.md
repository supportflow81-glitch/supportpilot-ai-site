
# ServeLink Phase 3.2 RAG

## Deployed flow
Admin saves knowledge_sources.raw_text -> knowledge-ingest -> text-embedding-3-small (1536 dimensions)
-> transactional chunk replacement -> ready.
Widget query -> same embedding model -> service-only match_knowledge_service
-> up to six relevant chunks + recent conversation -> Responses API gpt-5.6-luna.

The existing Supabase project is keucuxicejohafnokfkz.
Configure OPENAI_API_KEY in Supabase Edge Function secrets. No API secret belongs in this repository or browser code.

## Access and isolation
knowledge-ingest verifies the bearer token with Supabase Auth getUser, rejects anonymous users, and checks
platform administrator or organization owner/admin membership inside a service-only claim RPC.
Gateway verify_jwt is disabled intentionally because the function validates user tokens itself; this supports
the project's publishable-key browser client. A publishable key alone does not authorize ingestion.
The RPC derives the organization and assistant from the locked source; request bodies cannot override either.
Organization-wide sources (assistant_id null) are deliberately shared with assistants in that same organization.
Assistant-specific sources are never retrieved by another assistant. Retrieval requires a non-null assistant
belonging to the requested organization and verifies source/chunk scope consistency.
Browser roles cannot write embeddings or forge source processing status.

## Operational behavior
Sources are limited to 200,000 characters, 128 chunks, roughly 2,200 characters per chunk with 200-character
overlap. Embeddings are batched 16 at a time and dimension/finite-value validated.
A three-minute lease rejects overlapping jobs and allows recovery after an interrupted request.
Source edits invalidate in-flight job tokens. Complete batches replace old chunks in one transaction.
Failures retain old chunk rows but mark the source failed, excluding it from retrieval until successfully reprocessed.
Source editing or changing an assistant requires another ingestion request.
The dashboard automatically invokes ingestion after a successful save and offers retry for pending, failed,
and stale processing sources. Realtime or Refresh updates status. URL/file entries must include extracted raw text;
this release does not crawl URLs or parse binary uploads.
No-match, embedding failure, missing configuration, and Responses failure use a deterministic safe reply.
Customer messages and lead capture continue; human handoff disables AI.
No raw knowledge_sources content is sent by widget-chat, and each current customer message is included once.

## Validation
Run with Node 24:
    node --test tests/rag.test.mjs tests/widget.test.mjs

tests/rag-transaction.sql runs in a transaction and rolls back all fixtures. It requires an existing platform
administrator as a test principal. It verifies atomic rollback, replacement, stale tokens, duplicate claims,
unauthorized claims, and organization/assistant/null-filter isolation.

Live verification on 2026-09-15 completed successfully after configuring the API key and billing:
- Unauthenticated ingestion returned 401.
- Authenticated ingestion produced a ready source with one 1536-dimensional chunk.
- Reingestion replaced the chunk without duplicates.
- Live Responses API gpt-5.6-luna returned the exact $47 fee and cobalt-lantern-731 phrase from retrieved knowledge.
- Lead capture persisted one lead, and visitor/assistant messages persisted using the production schema values.
- Human handoff disabled AI; the following message received the human-queue response without another AI message.
- Cross-organization and invalid-assistant retrieval returned zero rows.
- Eight local regression tests passed, including enforcement of the production message sender constraint.
- Temporary verification accounts, organizations, conversations, leads, and knowledge sources were cleaned up.
- Existing project-wide advisor findings below remain outside this phase.

## Deployment
supabase/rag.sql is the exact applied production_rag_ingestion migration SQL.
Deploy functions/knowledge-ingest/index.ts and functions/widget-chat/index.ts with functions/_shared/rag.mjs
included as a relative dependency. Both use explicit in-function authorization appropriate to their callers.
The admin.js change is deployed through the repository's existing GitHub Pages workflow.
Do not run rag.sql again blindly: the trigger is intentionally created once through migration history.

## Remaining project-wide advisor findings
Supabase advisors still report the existing public-schema vector extension, authenticated SECURITY DEFINER
helper functions, disabled leaked-password protection, duplicate/permissive policies and indexes, and
unindexed foreign keys. The new claim/finish/retrieval functions use SECURITY INVOKER and have no
anon/authenticated execute permission. This release does not claim to resolve the separate project-wide audit.

References:
- https://developers.openai.com/api/docs/models/text-embedding-3-small
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/database/database-linter
