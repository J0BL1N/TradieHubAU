# TradieHubAU Production Auth Settings Checklist

Status: **Required before beta / not yet verified / not approved.**

`supabase/config.toml` configures local Supabase development only. It deliberately
supports local testing and is not a production-auth baseline. For the deployed
project, the hosted Supabase Auth dashboard/API configuration is the source of truth.

Do not record passwords, provider secrets, CAPTCHA secrets, tokens, or private keys
in this checklist. Record only the reviewer, date, setting outcome, and a safe link or
ticket reference where evidence is needed.

## Review record

- [ ] Hosted project/environment confirmed
- [ ] Reviewer and review date recorded
- [ ] Differences from local `supabase/config.toml` documented
- [ ] Security owner explicitly accepts the final hosted configuration

## Password policy

- [ ] Hosted minimum password length is set to the approved production value
- [ ] Password complexity and compromised-password protection options are reviewed
- [ ] Signup, password-change, and password-reset flows enforce the hosted policy
- [ ] Local `minimum_password_length = 6` is not treated as production-ready

## Email confirmation and account changes

- [ ] Production email confirmation requirement is explicitly decided and configured
- [ ] Email-change confirmation protects both old and new addresses where supported
- [ ] Production SMTP sender/domain and auth email templates are verified
- [ ] Confirmation links expire appropriately and redirect only to approved URLs

## Password recovery

- [ ] Recovery redirect URLs are explicitly allowlisted
- [ ] Recovery token/OTP lifetime and resend frequency are reviewed
- [ ] Secure password-change or recent-reauthentication controls are reviewed
- [ ] Recovery responses do not expose whether an account exists
- [ ] Successful recovery, expired-link, reused-link, and wrong-account cases are tested

## Rate limits and abuse controls

- [ ] Hosted signup/sign-in, email, OTP, token verification, and refresh limits are reviewed
- [ ] Limits are tested against expected beta traffic and basic automated abuse
- [ ] Monitoring/alert ownership for repeated auth failures is assigned

## CAPTCHA and bot protection

- [ ] hCaptcha, Turnstile, or another approved bot-control decision is recorded
- [ ] If enabled, provider secrets exist only in hosted secret configuration
- [ ] Protected signup/recovery flows and failure behaviour are tested
- [ ] If deferred, the risk owner and required activation milestone are recorded

## URLs and OAuth providers

- [ ] Hosted Site URL matches the intended deployed frontend origin
- [ ] Additional redirect URLs contain only required exact production/beta origins
- [ ] Localhost, stale preview, and unintended wildcard redirects are removed
- [ ] Each enabled OAuth provider callback URL matches the hosted Supabase callback
- [ ] OAuth client IDs, secrets, scopes, and disabled providers are reviewed
- [ ] Sign-in success, denial, callback mismatch, and account-linking behaviour are tested

## Exit criteria

- [ ] All required hosted settings above are verified with safe evidence references
- [ ] Remaining exceptions have an owner, risk decision, and due date
- [ ] Manual auth regression passes in the intended beta environment
- [ ] v0.1.0 readiness is decided separately; completing this document alone is insufficient
