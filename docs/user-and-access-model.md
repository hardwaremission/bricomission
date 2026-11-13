# User and Access Model

Identity, roles, and sessions are owned by Keycloak (realm `BricoMission`). The API enforces resource-level rules below.

## User Types

| Type | Keycloak role | How they join |
| --- | --- | --- |
| Anonymous visitor | none | Opens the PWA |
| Homeowner | `user` | Google SSO (online) or username/password + email OTP (offline-capable) at the Login Gate |
| Professional | `professional` | Self-registration with corporate email, Company legal name, Tax ID (CIF/NIF); starts `pending_validation` |
| Administrator | `admin` | Seeded in the realm; no self-registration |

## Seeded Accounts (local realm)

The realm import (`infra/keycloak/import/BricoMission-realm.json`) seeds one account per role. Passwords come from env vars with dev defaults in `.env.example`:

| Username | Email | Realm role |
| --- | --- | --- |
| `bm-admin` | `admin@bricomission.local` | `admin` only (never `user` or `professional`) |
| `bm-homeowner` | `homeowner@bricomission.local` | `user` |
| `bm-professional` | `professional@bricomission.local` | `professional` |

Browser password login requires a second step for every realm user: a 6-digit code sent by email (Mailpit offline). Google SSO arrives with `google-sso-login`.

Homeowner self-registration (`keycloak-login-theme`): the Keycloak sign-in page links to "Create account" (first name, last name, email, username, password, confirm password). The new account gets exactly realm role `user` through the default role and must enter the 6-digit email code before it is signed in (registration flow `registration-email-otp`). Seeded accounts keep only their listed role. Usernames and emails are unique; a taken username or email is reported on the field. Keycloak pages and the code email use the app's current language (`ui_locales`); Keycloak stores no language on the account. Keycloak SSO sessions end after 8 h idle (max 10 h). Professional self-registration with Tax ID is a separate feature (`professional-registration`); until then every self-registered account is a Homeowner.

Web sign-in (`homeowner-password-login`): the PWA signs in through the web server (client `bricomission-web`), from the "Sign in" entry in the Home header or `/auth/login?mode=register`; the user lands back on the page they came from. Any realm account (Homeowner, Professional, Administrator) may sign in on the web; role-specific screens come later. The web session lasts as long as the Keycloak session (8 h idle, 10 h max) and survives web restarts. Sign-out ends the Keycloak SSO session too (backchannel logout), so the next sign-in asks for the password again; if Keycloak is unreachable, the local session is removed anyway. Sign-in is never forced on Home (the Login Gate is `login-gate-claim`).

The API is default-deny. Every route needs a valid Keycloak access token unless it is marked public (`/health`, `/docs`). Role checks return 403. Resource-level rules (ownership, Company scoping) arrive with the features that own those resources.

## Roles

- **Homeowner**: owns Kitchen Projects.
- **Professional**: acts for exactly one Company.
- **Administrator**: operates the platform; never acts as Homeowner or Professional.

## Permissions

| Action | Anonymous | Homeowner | Professional (active) | Administrator |
| --- | --- | --- | --- | --- |
| Upload photos, Measurements, Moodboard (draft) | yes | yes | no | no |
| Generate Render / Budget (costly AI) | no (Login Gate) | yes, within quota | no | no |
| Chat with Persona | no | yes, own projects | no | no |
| Shopping List PDF / publish Dossier | no | own projects | no | no |
| View open Dossiers | no | own only | all, if Company validated | all |
| Create / edit Bid | no | no | own Company, if no Bid exists yet / as managing Professional | no |
| View Company Bids and Kitchen Projects | no | no | own Company: own = edit, co-workers' = read-only | all |
| See Company identity on a Bid | no | only after acceptance | n/a | yes |
| Accept Bid, Electronic Acceptance | no | own Dossier | own Company Contract (managing Professional) | no |
| Validate Companies, manage users, quotas, settings | no | no | no | yes |

## Ownership Boundaries

- A Kitchen Project belongs to one Homeowner. Anonymous drafts belong to a browser session until claimed at the Login Gate.
- A Bid belongs to its Company; the creating Professional is its manager.
- Contracts are visible to the Homeowner, all Professionals of the Company (manager edits/accepts, others read-only), and Administrators.

## Access Rules

- Professionals in `pending_validation`, `rejected`, or `disabled` cannot see Dossiers.
- Bids shown to Homeowners expose price, installation date, penalty, and platform rating only; no Company name, Tax ID, email, or contact data until acceptance.
- No messaging channel exists between Homeowner and Professional.
- Costly AI calls check the Daily Quota when the Quota Flag is on; Administrator overrides take precedence over global limits.

## Revocation / Expiry

- Administrator disables an Account: Keycloak sessions are revoked; open Bids of that Professional stay with the Company and can be reassigned by an Administrator.
- Company rejected or disabled: its open Bids move to `closed`; binding Contracts are unaffected.
- Dossier expiry closes all Bids.
- Anonymous drafts not claimed within 7 days are deleted (assumption).

## Edge Cases

- Professional leaves a Company: not self-service in MVP; Administrator disables the Account.
- Same person as Homeowner and Professional: requires two separate Accounts.
- A Tax ID matching an existing validated Company: Administrator links the new Professional instead of creating a duplicate Company.
