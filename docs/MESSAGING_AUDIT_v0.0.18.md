# Messaging Audit v0.0.18

Audit date: 2026-06-27  
Scope: inspection only of the current Job Messaging / conversations / messages implementation in the active `frontend` app and `supabase` migrations.

## Summary

The repo already contains a substantial v0.0.18 Job Messaging Foundation: real job-tied conversations, RPC-gated conversation opening and message sending, participant-only reads, recipient-only read-state updates, active-conversation Supabase Realtime, image attachment foundation, frontend attachment uploads/gallery, Enter-to-send, pagination, and a temporary 1,000-message cap.

The main foundation gap is lifecycle/system messages. There is no `message_type` column, no system-message creation path, and no automatic messages for quote acceptance, payment funding, completion submission, approval/release, dispute opening, or admin dispute actions.

Update: the active message thread bottom-scroll behavior has been fixed after this audit. The frontend now schedules scroll-to-bottom after message render, retries briefly for late layout changes, and re-scrolls when message attachment images finish loading while preserving older-message pagination position.

## Current Implementation Status

Implemented:

- Real `/messages` route in `frontend/src/pages/Messages.tsx`.
- Job conversation list via `list_job_conversations()`.
- Per-job thread opening via `/messages?job=<job_id>` and `open_job_conversation()`.
- Message send via `send_job_message()` and `send_job_message_with_attachments()`.
- Read/unread foundation via `messages.read`, `messages.read_at`, unread counts, and recipient-only read updates.
- Supabase Realtime subscription for active conversation inserts and updates.
- Private image attachment table, private storage bucket, upload/read policies, signed thumbnails, and lightbox.
- Job details/list messaging entry points for valid accepted/funded/review/disputed/completed participants.
- Backend pre-funding block for obvious phone/email strings in message text when payment status is `pending`.

Not implemented:

- `message_type` support.
- Dedicated immutable system messages.
- Automatic lifecycle message insertion.
- Admin dispute message/audit feed integration.
- Conversation-level participant table; participants are modeled directly as `conversations.user1_id` and `user2_id`.

## Database Findings

### Tables

`public.conversations` is created in `supabase/migrations/001_initial_schema.sql` with:

- `id`
- `user1_id`
- `user2_id`
- `job_id`
- `job_title`
- `last_message_text`
- `last_message_at`
- `last_message_from`
- `created_at`
- `updated_at`

`job_id` was originally optional, but migration `037_job_messaging_foundation.sql` makes active messaging effectively job-tied by dropping the pair-only unique index and adding `conversations_unique_job_pair` on `(job_id, least(user1_id, user2_id), greatest(user1_id, user2_id)) where job_id is not null`.

`public.messages` is created with:

- `id`
- `conversation_id`
- `sender_id`
- `text`
- `read`
- `read_at`
- `created_at`
- `updated_at`

There is no `message_type`, `system_event_type`, `metadata`, `edited_at`, `deleted_at`, or attachment field on `messages`.

`public.message_attachments` is added in `040_message_attachments_foundation.sql` with immutable metadata:

- `id`
- `message_id`
- `conversation_id`
- `job_id`
- `uploader_id`
- `bucket_id`
- `storage_path`
- `file_name`
- `mime_type`
- `file_size`
- `width`
- `height`
- `created_at`

### Job Tie and Participants

Current conversation participants are modeled as:

- `user1_id` = job customer.
- `user2_id` = accepted payee/tradie from `payments.payee_id`.

The canonical relationship is enforced repeatedly in policies/RPCs by joining `conversations`, `jobs`, and `payments` and checking:

- `c.job_id = j.id`
- `c.user1_id = j.customer_id`
- `c.user2_id = p.payee_id`
- `p.payer_id = j.customer_id`
- current user is in `(c.user1_id, c.user2_id)`

This is clear enough for v0.0.18, though it is not as extensible as a dedicated `conversation_participants` table.

### Message Support

Current support:

- User messages: yes, through text and attachment RPCs.
- Read status: yes, per message with `read`/`read_at`.
- Attachments: yes, image-only private attachment foundation.
- Lifecycle events: no.
- System messages: no dedicated type/path.
- Message type: no column.

## RLS/Security Findings

### Conversations

Current SELECT policy:

- `Job participants view conversations` lets only authenticated job customer or accepted payee view a conversation, and only while the job status is one of `accepted`, `payment_held`, `completed_pending_review`, `disputed`, or `completed`.

Current INSERT policy:

- Direct client INSERT was dropped in `037_job_messaging_foundation.sql`.
- Creation is through `open_job_conversation(p_job_id)`, granted only to `authenticated`.

Current UPDATE policy:

- Broad participant conversation UPDATE was dropped in `033_lock_message_conversation_updates.sql`.
- No replacement client UPDATE policy was found. Last-message cache is maintained by the trusted `update_conversation_last_message()` trigger.

Current DELETE policy:

- No conversation DELETE policy found.

### Messages

Current SELECT policy:

- `Job participants view messages` limits reads to the authenticated customer or accepted payee for the job conversation, again requiring messageable job states.

Current INSERT policy:

- Direct client INSERT was dropped in `037_job_messaging_foundation.sql`.
- Text sends use `send_job_message(p_conversation_id, p_text)`.
- Attachment sends use `send_job_message_with_attachments(p_message_id, p_conversation_id, p_text, p_attachments)`.

Current UPDATE policy:

- `Job recipients can mark messages read` allows only non-senders in valid job conversations to update incoming messages.
- `protect_message_read_updates()` enforces unread-to-read only, server-managed `read_at`, and immutable `id`, `conversation_id`, `sender_id`, `text`, `created_at`, and `updated_at`.

Current DELETE policy:

- No message DELETE policy found.

### Spoofing and Wrong-Party Access

Sender spoofing:

- RPCs insert `sender_id = auth.uid()`, so callers cannot choose a sender.

Conversation spoofing:

- RPCs re-check the conversation against `jobs` and `payments`; wrong users cannot send into arbitrary conversation IDs unless they are the accepted customer/payee pair.

Wrong tradie access:

- Policies/RPCs use `payments.payee_id` and accepted job states, so non-contracted tradies should not read/open/send in the conversation.

Unrelated customer access:

- Policies/RPCs require `auth.uid()` in the canonical conversation pair, so unrelated customers should not access job messages.

Broad policies:

- Earlier broad policies in `002_rls_policies.sql` are superseded by later migrations. The active migration chain drops broad conversation insert/update and broad message insert/update policies.
- There is no admin-wide conversation/message read policy. This avoids broad admin exposure, but it also means admin dispute pages do not currently include message history through RLS.

### Contact-Gating Interaction

Backend:

- `send_job_message()` and `send_job_message_with_attachments()` block obvious email and Australian phone patterns while payment status is `pending`.

Frontend:

- Messages show a pre-funding warning when `payment_status === 'pending'`.
- Job details only show private email/phone after `payment_held`, `completed_pending_review`, `disputed`, or `completed`.

Remaining limitation:

- The backend message gate is regex-based for obvious phone/email only. It does not block URLs, social handles, all obfuscation patterns, or contact details embedded in images.

## Frontend Findings

Messaging is rendered in:

- `frontend/src/pages/Messages.tsx`
- `frontend/src/lib/messages.ts`
- Route registration in `frontend/src/App.tsx`
- Navigation entry in `frontend/src/components/Layout.tsx`
- Job list/detail entry points in `frontend/src/pages/Jobs.tsx`

Conversation list:

- Yes. `Messages.tsx` calls `getJobConversations()` and renders a conversation sidebar with counterpart, job title, last message, timestamp, status, and unread count.

Per-job thread:

- Yes. `/messages?job=<job_id>` calls `openJobConversation(jobId)` and redirects to `/messages?conversation=<conversation_id>`.

Sending:

- Yes. Text sends use `sendJobMessage()`.
- Image attachment sends upload to private storage first, then finalize through `sendJobMessageWithAttachments()`.
- Enter sends; Shift+Enter inserts newline.

Read status:

- On load and realtime insert, incoming unread messages are marked read through `markIncomingMessagesRead()`.

Gating:

- `Jobs.tsx` exposes message buttons only when the job status is one of `accepted`, `payment_held`, `completed_pending_review`, `disputed`, or `completed`, and only for the job owner or accepted tradie.
- Direct contact details in job details are locked before funded states and unlocked only after payment funding/review/dispute/completion states.

Potential stale/non-working entry points:

- `BrowseCustomers.tsx` and `Profile.tsx` still link to `/messages?user=<id>`, but `Messages.tsx` does not implement a `user` query path. Current real messaging is job-tied via `job` or direct `conversation`.

## Lifecycle/System Message Findings

No automatic message insertion was found for:

- Quote submitted.
- Quote accepted.
- Payment funded / contract active.
- Completion proof submitted.
- Customer approval / payment release.
- Dispute opened.
- Admin dispute action.

Safest backend insertion points later:

- Quote submitted: `submitApplication()` frontend currently writes applications; safest backend path would be a future RPC-only application submission function before adding a system message.
- Quote accepted: `accept_quote(p_job_id, p_application_id)`.
- Payment funded / contract active: `simulate_payment_funding(p_job_id)` for local MVP; future real funding webhook/RPC for real payments.
- Completion proof submitted: `submit_completion_proof(p_job_id, p_description, p_attachments)`.
- Customer approval/payment release: `approve_job_completion(p_job_id)`.
- Dispute opened: `raise_job_issue(p_job_id, p_description, p_attachments)`.
- Admin dispute action: `resolve_dispute(p_job_id, p_resolution, p_split_percentage)` and any later admin soft-action RPC/log table.

Recommended later approach:

- Add a trusted SECURITY DEFINER helper such as `insert_job_system_message(...)`.
- Ensure it opens/finds the canonical job conversation and inserts immutable `message_type = 'system'` rows with structured metadata.
- Call it from the lifecycle RPCs after the lifecycle mutation succeeds in the same transaction.

## Realtime Findings

Supabase Realtime is currently used.

- `039_enable_message_realtime.sql` adds `public.messages` to the `supabase_realtime` publication.
- `Messages.tsx` subscribes to `postgres_changes` for `INSERT` and `UPDATE` on the active `conversation_id`.

Current refresh/polling behavior:

- Initial load/refetch uses direct queries/RPCs.
- Manual refresh buttons reload conversations and message history.
- After sending, the frontend calls `loadMessages()` and `loadConversations()`.
- Active conversation also receives realtime inserts/updates.

Required later for fuller live chat:

- Realtime for conversation list updates across inactive conversations, or a notification/unread channel.
- Optional realtime for `message_attachments` if attachment metadata needs to arrive independently from messages.
- Presence/typing indicators if desired.
- A clearer reconciliation strategy to avoid double refetches after local sends.

## Gaps

Against the intended v0.0.18 foundation:

- Job-tied conversations: implemented.
- One conversation per accepted/funded job: implemented as one canonical conversation per job/customer/payee, but allowed as early as `accepted` before payment funding.
- Only job owner and accepted tradie can access: implemented through policies/RPCs.
- Immutable user messages: implemented, except recipient read-state updates are allowed.
- Immutable system messages: not implemented.
- `message_type` support: not implemented.
- Read/unread foundation: implemented.
- Safe message creation path: implemented through authenticated RPCs.
- No contact-gating bypass: mostly implemented for stored contact details and obvious phone/email text before funding; not comprehensive for URLs/obfuscation/images.
- No broad admin/user data exposure: no broad conversation/message admin policies found; public/user profile exposure handled elsewhere.
- Docs/roadmap updated: `docs/ROADMAP.md` already tracks v0.0.18 messaging work and marks lifecycle system messages as pending.

## Recommended Next Implementation Plan

### Must Do For v0.0.18 Foundation

1. Add `messages.message_type text not null default 'user' check (message_type in ('user', 'system'))`.
2. Add optional structured system fields, either `system_event_type text` plus `metadata jsonb`, or a minimal `metadata jsonb` only.
3. Update immutability trigger so `message_type`, `system_event_type`, and `metadata` are immutable.
4. Add a trusted backend helper for lifecycle system messages; do not expose direct client system-message insertion.
5. Insert system messages from accepted backend lifecycle RPCs for quote accepted, payment funded, completion submitted, approval/release, and dispute opened.
6. Decide whether admin dispute soft actions should write messages now or wait for the later admin dispute audit log.
7. Update `list_job_conversations()` and message selects only if new fields are rendered or needed.
8. Update docs/roadmap to reflect the final v0.0.18 boundary.

### Nice To Have But Can Defer

- System message UI styling.
- Conversation list realtime for inactive conversations.
- Typing indicators/presence.
- Rich attachment types beyond image-only.
- Conversation reporting/moderation.
- Search across messages.
- More comprehensive anti-contact-sharing detection.
- Admin message audit console.

### Should NOT Do Yet

- Real payment provider hooks.
- Email/push notifications.
- Masked relay contact.
- Production moderation tooling.
- Full admin access to all conversations without a separate support/audit policy decision.
- Subjective visual redesign of the messages UI.

## Validation

Commands run:

- `npm run build` in `frontend`: passed.
- `npm run lint` in `frontend`: failed on existing lint debt.

Build notes:

- Vite emitted a chunk-size warning for the built JS bundle, but the production build completed successfully.

Lint notes:

- `eslint .` reported 94 problems: 90 errors and 4 warnings.
- Findings include existing `no-explicit-any`, `react-hooks/set-state-in-effect`, and `react-refresh/only-export-components` issues across multiple files.
- Messaging-specific lint findings include `Messages.tsx` hook/set-state-in-effect and `any` typing issues.

## Files Inspected

- `README.md`
- `ROADMAP.md`
- `docs/ROADMAP.md`
- `docs/DAILY_WORK_LOG.md`
- `docs/SUPABASE_INTEGRATION.md`
- `docs/SUPABASE_SETUP.md`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/migrations/003_phase3_trust_money.sql`
- `supabase/migrations/009_quote_and_payment_lifecycle.sql`
- `supabase/migrations/010_payment_funding_ledger_fix.sql`
- `supabase/migrations/011_variation_funding_safety.sql`
- `supabase/migrations/016_fix_ambiguous_status_references.sql`
- `supabase/migrations/017_change_review_timer_to_72_hours.sql`
- `supabase/migrations/018_add_dispute_evidence_attachments.sql`
- `supabase/migrations/021_secure_simulate_payment_funding_rpc.sql`
- `supabase/migrations/022_block_direct_client_payment_inserts.sql`
- `supabase/migrations/023_add_public_profile_boundary.sql`
- `supabase/migrations/026_block_completion_approval_during_disputes.sql`
- `supabase/migrations/027_add_admin_dispute_read_policies.sql`
- `supabase/migrations/028_finalize_critical_high_security_guards.sql`
- `supabase/migrations/029_harden_proof_dispute_inserts.sql`
- `supabase/migrations/033_lock_message_conversation_updates.sql`
- `supabase/migrations/036_explicit_rpc_execute_grants.sql`
- `supabase/migrations/037_job_messaging_foundation.sql`
- `supabase/migrations/039_enable_message_realtime.sql`
- `supabase/migrations/040_message_attachments_foundation.sql`
- `supabase/migrations/041_message_pagination_cap.sql`
- `supabase/functions/handle-new-message/index.ts`
- `supabase/functions/handle-new-proposal/index.ts`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/lib/messages.ts`
- `frontend/src/lib/jobs.ts`
- `frontend/src/lib/payments.ts`
- `frontend/src/lib/users.ts`
- `frontend/src/pages/Messages.tsx`
- `frontend/src/pages/Jobs.tsx`
- `frontend/src/pages/Profile.tsx`
- `frontend/src/pages/BrowseCustomers.tsx`
- `frontend/src/pages/Admin.tsx`
- `frontend/src/pages/AdminDisputes.tsx`
- `frontend/src/pages/AdminDisputeCase.tsx`
- `frontend/src/pages/BetaInfoPages.tsx`
