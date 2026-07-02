# TradieHubAU Beta Polish Backlog

This backlog documents intentional design, security settings, and warnings that are preserved in the system, along with dashboard configuration items required by Jay.

---

## 1. Intentional Supabase Lint Warnings
The following warnings are flagged by the Supabase database linter but are kept intentionally to support guest and public-page interactions.

### `anon_security_definer_function_executable`
- **Functions**:
  - `can_read_public_completion_proof_image(p_name text)`
  - `list_public_tradie_completion_proof_gallery(p_tradie_id uuid)`
  - `list_public_tradie_gallery(p_tradie_id uuid)`
  - `list_public_tradie_review_summaries(p_tradie_ids uuid[])`
  - `list_public_tradie_reviews(p_tradie_id uuid)`
- **Rationale**: 
  - Anonymous guest visitors who are not logged in must be able to view tradie public profiles, read reviews, browse their portfolio gallery, and view portfolio images. 
  - Revoking execute rights on these functions from `anon` or the public role would break guest browsing entirely.
  - The security definer functions are audited and only select public, sanitized columns (excluding private emails, phone numbers, stripe logs, etc.) and perform explicit boundary checking, so they are completely safe.

---

## 2. Dashboard Security Tasks for Jay
The following settings must be enabled manually in the Supabase Dashboard as they are outside standard SQL migrations.

### Leaked Password Protection
- **Status**: Checked / Pending Manual Enable.
- **Action**: Jay should log in to the Supabase Dashboard, navigate to **Auth Settings** -> **Security**, and toggle on **Leaked Password Protection** before launching the local beta or opening registration publicly.

---

## 3. Public Profile Safety Backlog
The following items are planned for future phases to further enforce profile safety and prevent off-platform bypasses:

- **Approved Public Alias/Admin Approval Workflow**:
  Create an admin review step where custom public display names must be manually approved by staff before going live, preventing users from crafting clever bypasses not caught by automated regex checks.
- **Image OCR/Logo Moderation**:
  Integrate automated vision scanning (OCR) to detect and flag phone numbers, emails, website domains, and social media links embedded inside uploaded gallery images, logos, profile pictures, or watermarks.
- **Advanced Profile Risk Scoring**:
  Automatically elevate risk scores for profiles containing repeatedly flagged bypass attempts, triggering alerts in the admin console.
- **"My Tradies" Saved List**:
  Allow homeowners to curate a private list of saved tradie profiles to reference again later.
- **Full Legal/Policy Review**:
  Conduct a comprehensive legal review of public profile details, terms of use, and privacy policy safeguards before public marketing.
- **Global Lightbox & Gallery Viewer**:
  Extend the existing chat attachment lightbox in Messages.tsx to act as a global component, supporting zoom, download, and swipe-navigation across all completion proof galleries and work photos.
