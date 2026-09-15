# Phase 3.3 — Customer widget
- Each assistant provides its name, greeting, and brand color through the public config action. System prompts, origin lists, and credentials are not returned.
- Anonymous chat uses a random 256-bit session token; only its SHA-256 hash is stored. Every history/read/send is scoped to the token, organization, and assistant. Tokens are stored in sessionStorage per assistant, restoring within the same browser tab across reloads. Previous tokenless conversations remain in the admin inbox but cannot be reopened by the new widget.
- History returns the latest 100 visitor/assistant/agent messages, excluding internal system messages. No transcript is stored in browser storage. Start new chat replaces the local session; it does not delete the old inbox conversation.
- While open and visible, the widget polls history every 3 seconds for human replies and handling status. Closing/hiding the widget suspends polling. This is polling, not a realtime WebSocket subscription.
- Message requests use UUID request IDs and a unique database index to suppress duplicates. A retry can recover a lost conversation ID using the same private session token.
- Human-agent inserts atomically disable AI and set handoff status. The service-only completion RPC locks the conversation and checks handling before inserting an AI reply. The admin inbox offers takeover/resume controls.
- Branding & installation controls let platform admins set name, greeting, color, and exact allowed HTTPS origins, and copy a per-assistant installation snippet. localhost HTTP origins are supported for testing.
- The widget includes sending state, reconnect/retry, keyboard close, accessible form labels, high-contrast brand buttons, new-chat confirmation, and escaped message text with basic bold formatting.
- Public config/history/message endpoints require an allowed Origin. Origin checks are browser restrictions, not a substitute for rate limiting.
- Secrets remain in Supabase. Public widget keys are installation identifiers, not authorization to read conversations.

## Deployment
Apply supabase/widget-lifecycle.sql once through migration history, deploy widget-chat with _shared/rag.mjs, and publish widget.js/admin.js/demo.html/admin.html.
The demo page and installation snippets use widget.js?v=3.4 to refresh cached browser assets.
No change to the OpenAI model or ingestion configuration is required.

## Verification
Live API tests passed for config field filtering, origin restrictions, token requirement, actual AI response, restored history, wrong-token rejection, request replay, lost-response recovery, human reply delivery, AI shutoff, and fresh-session isolation.
Regression tests: node --test tests/rag.test.mjs tests/widget.test.mjs
Supabase security/performance advisors were run after the schema change. Existing project-wide findings remain, including public vector extension, authenticated security-definer helpers, disabled leaked-password protection, duplicate indexes/policies, and unindexed foreign keys. The new completion function uses SECURITY INVOKER with service-role-only execution.

## Limits
Sessions are per tab (not cross-device). Only the latest 100 messages are displayed. Website code on the host page can access the same browser storage, so host-site XSS protection remains important. Launch limits and diagnostic logging are documented in LAUNCH.md.
