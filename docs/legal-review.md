# Legal review package — Roosevelt / Luxor Intelligence LLC

Prepared 2026-10-04 for review by counsel. The public documents were **drafted by an AI assistant from the actual code and configuration** and have **not** been reviewed by a lawyer. This file lists what the code really does, what the drafter assumed, and what needs a decision. Nothing here is legal advice.

## 1. Documents under review (live)

| Document | Roosevelt (itsroosevelt.com) | Company site (luxorintelligence.com) |
|---|---|---|
| Privacy Policy | `https://www.itsroosevelt.com/privacy` | `https://www.luxorintelligence.com/en/privacy` |
| Terms of Service | `https://www.itsroosevelt.com/terms` | `https://www.luxorintelligence.com/en/terms` |
| Data Deletion Instructions | `https://www.itsroosevelt.com/data-deletion` | `https://www.luxorintelligence.com/en/data-deletion` |

Source: generated from one template for both sites (Roosevelt: `src/app/{privacy,terms,data-deletion}/page.tsx`; company: `land-luxor-intelligence/app/[locale]/...`). Mailboxes published: `legal@`, `support@`, `business@`, `careers@` on each domain (`business@` on the company site only appears in the footer).

Meta (Facebook/Instagram/WhatsApp) app review requires: privacy policy URL, terms URL, user data deletion instructions URL, business verification (portfolio: Luxor Intelligence LLC, verified).

## 2. Entity facts used

- Operator: **Luxor Intelligence LLC**, 470 W 200 N, Salt Lake City, UT 84103 (address taken from the company website footer). Footer also shows phone +1 (385) 865-3535.
- Products listed on the company site: Roosevelt (itsroosevelt.com), Royalty (itsroyalty.us), Sterling (itssterling.com); tokens $LXR, $XLS, $USDX (separate sites: luxorstandard.com, excelsiorstandard.com, occidentstandard.com).
- The company website's careers text (`land-luxor-intelligence/lib/jobs-data.ts`) states Luxor is "incorporated in Salt Lake City, Utah". The Terms were still left generic on governing law pending counsel's decision; Utah is the likely candidate.
- **Unknown to the drafter:** state/country of organization, registered agent, whether Stripe/other accounts are held by a different legal entity (the Stripe account observed is named "Udreamms LLC"), EU/UK establishment.

## 3. What Roosevelt does (from the code)

- Multi-tenant SaaS: each user creates personal or business profiles ("entities"); all customer data lives under `users/{uid}/entities/{entityId}/...` in Google Firestore.
- Channels the user can connect: WhatsApp Cloud API, Facebook Messenger, Instagram (DMs and comments), Telegram bots, X (currently a mock-up), Gmail. Inbound messages arrive through provider webhooks and are stored as conversations/contacts/cards; the platform can auto-reply via configurable bots and AI.
- Modules: CRM, omnichannel inbox, Kanban, broadcast (bulk messaging by segment), web builder (GitHub connection), revenue/finance views, voice/meeting agents, AI assistant (Google Gemini; SDKs for Anthropic/OpenAI/Vertex present).
- Payments: Stripe (card, platform adds the Stripe fee to the price) and Solana (on-chain). Subscription plans with 30-day periods.
- Roles in privacy terms: Luxor is **controller** of account/billing/usage data and **processor** of customers' end-user data (messages, contacts). Customers (businesses) message their own customers through the Service.

## 4. Personal data inventory (by category)

| Category | Examples | Source | Location |
|---|---|---|---|
| Account | name, email, photo, auth provider, language | user / Google sign-in | Firebase Auth + Firestore |
| Workspace | contacts, leads, notes, boards/cards, flows, templates, files | user / import | Firestore, Cloud Storage |
| Channel data | message text, comments, media, sender IDs, phone numbers, usernames, page/IG/WABA IDs, access tokens | Meta, Telegram, X, Google via webhooks/OAuth | Firestore (tokens stored in each tenant's `integrations/*` documents) |
| Billing | plan, status, Stripe customer/payment-intent IDs, last4/brand, wallet address, tx signature | Stripe / Solana | Firestore + Stripe |
| AI | prompts, outputs | user | sent to model provider; stored with conversations where applicable |
| Technical | IP, user agent, logs | automatic | Vercel / Google Cloud logs |
| Diagnostics | webhook payload snippets (`system_logs`), unmapped-webhook diagnostics (`webhook_diagnostics/*`) | providers | Firestore |

No sensitive categories are collected as a feature; free-text fields can contain anything the customer chooses.

## 5. Third-party permissions requested today

- **Meta (Facebook Login scopes in the code):** `pages_messaging`, `pages_show_list`, `pages_read_engagement` (Messenger); `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` (Instagram); `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` (WhatsApp). Planned for the new platform app: publishing, comments management, insights, Marketing API (campaigns, insights, lead retrieval).
- **Google:** `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile` (Gmail integration and Google sign-in). Limited Use language is included in the Privacy Policy; counsel should confirm it is accurate and sufficient, since Gmail restricted scopes require a security assessment (CASA).
- **Others:** Stripe (payments), GitHub (`repo`, `user:email` for web builder), Telegram bot tokens, X (planned OAuth 2.0).

## 6. Sub-processors named in the policy

Google Cloud / Firebase (auth, database, storage, functions); Vercel (hosting); Stripe (payments); Solana RPC/network (public); Google Gemini / Vertex AI and other AI providers; Meta, Google, Telegram, X (as connected by the user); email tools used for support. No DPA/SCC status has been verified for any of them.

## 7. Technical safeguards: implemented vs. pending

Implemented and tested (`npm run test:isolation`, Firestore emulator, 63 checks):
- Firestore rules: only the owner can read/write `users/{uid}/**`; everything else denied to the browser; no browser `collectionGroup` queries.
- Private API routes verify the Firebase ID token and that the `userId` matches.
- Provider webhook signature verification code exists (Meta/WhatsApp `X-Hub-Signature-256`, X, Telegram secret token per entity, Gmail Pub/Sub JWT). **Meta/X/Gmail are currently in `log` mode (not blocking)**; Telegram is enforced for re-registered bots. The policy intentionally does not claim webhook verification.
- Verified ownership claims for Messenger/Instagram/WhatsApp IDs (server-written registry); ambiguity guard if two users claim the same ID; no fallback to platform-owner credentials.

Known gaps (do not appear in public text, but counsel should know):
- Subscription plans: as of 2026-10-04 the plan is decided only on the server (client can no longer write subscription documents; payment amounts and plans are fixed server-side; the public access code was removed). Server-side blocking of paid suites is on by default; only personal profiles are free. Enterprise ($999.99/month; $799.99/month billed annually) is purchasable by card (Stripe) or Solana. Free 30-day trial codes exist for each plan (one per environment and per account).
- `storage.rules` do not cover several paths used by the app and are too permissive on two paths.
- The `github_token` cookie is per browser, not bound to the user.
- Integration tokens are stored in Firestore under the tenant's own documents (readable by that tenant's authenticated browser session).
- **No self-service account deletion** exists; deletion is by email request (the Terms/Deletion page were written accordingly).
- Anti-abuse limits missing on `solana/airdrop` and `referrals/claim`.
- No cookie-consent banner; the company site loads Google Analytics (gtag) for all visitors. Roosevelt's app loads no analytics (verified by code search) but loads the Meta JS SDK.
- No record of consent to Terms is stored; the login page now shows "By continuing, you agree to…" with links (browse-wrap style).

## 8. Assumptions made by the drafter (please confirm or change)

1. **Governing law/venue:** written generically ("jurisdiction in which Luxor Intelligence LLC is organized"); informal 30-day resolution first. Consider choosing a state, arbitration, class-action waiver, small-claims carve-out.
2. **Operational promises in the policy:** deletion "generally within 30 days"; confirmation of receipt "within a few business days"; CCPA response within 45 days; GDPR breach notice "within 72 hours where feasible"; backups overwritten "in the ordinary course". Confirm these are achievable and process-backed.
3. **Liability cap:** greater of 12 months' fees or US$100; confirm.
4. **Auto-renewal and refunds:** card subscriptions auto-renew (monthly or annual; charged ~1 day before expiry; up to 3 days of retries/grace; cancellation stops renewal at period end); on-chain (Solana) payments do NOT auto-renew; no refunds except where required. Check US state automatic-renewal laws (e.g., California ARL: clear disclosure, express consent, easy online cancellation, reminders) and EU/UK consumer rules (withdrawal rights for consumers).
5. **Age:** 18+.
6. **No sale/sharing of personal data**; no knowledge of under-16 data.
7. **AI:** states Luxor does not itself train generalized models on Customer Data; providers process under their own terms. Verify the actual provider tier/terms (e.g., paid Gemini API terms regarding training) and whether Customer Data is retained by providers.
8. **Gmail Limited Use / "no human reading" statement:** confirm internal practice (developers with Firestore console access can technically view data).
9. **DMCA:** text invites notices to `legal@`; a designated agent must be registered with the US Copyright Office for safe harbor.
10. **EU/UK representative and DPO:** not appointed; policy says details will be published if appointed. Evaluate Art. 27 GDPR/UK GDPR need.
11. **Processor terms:** policy says a DPA is available on request; none exists yet. Needs a DPA template (with SCCs/UK Addendum).
12. **Cookies:** Roosevelt text says no third-party analytics/advertising; company text discloses Google Analytics and opt-out. EEA/UK/CA consent mechanism needed for GA.
13. **Messaging compliance:** Terms push TCPA, CAN-SPAM, GDPR/ePrivacy, Meta/WhatsApp policies onto the customer. Consider an explicit acceptable-use/anti-spam policy and audit rights.
14. **Digital assets:** Terms include general "not investment advice / irreversible" language. Token-related offerings (LXR/XLS/USDX, "RWA", stablecoin, presale pages on the company site) raise securities, money-transmitter/AML/KYC and consumer-protection questions that are **outside** these drafts.
15. **Scope of the company-site policy:** states it covers luxorintelligence.com and Roosevelt; Royalty and Sterling data practices were not described because they are unknown to the drafter.
16. **Taxes:** prices exclude taxes; sales-tax/VAT registration and collection (US states, EU OSS) not addressed.
17a. **Branding vs. disclosure:** the product is now marketed as "Roosevelt Super Intelligence (SI)" and the public texts avoid the term "AI" for branding. The documents still state that SI output is generated automatically by a non-human system and that features are powered by third-party machine-learning models. Counsel should confirm this satisfies chatbot/automated-communication disclosure laws (e.g., California B.O.T. Act, Utah AI disclosure rules, EU AI Act transparency duties) and that marketing claims about "super intelligence" are not misleading (FTC).
17. **Language:** English only; the app UI is Spanish/English. Consider Spanish versions for consumer-facing markets.
18. Address, phone and email addresses are taken from the public site; confirm that the four mailboxes exist and are monitored (legal requests, privacy requests, DMCA, careers).

## 9. Open questions for counsel

- Entity structure: is Luxor Intelligence LLC the contracting party for Roosevelt, or another entity (e.g., Udreamms LLC billing via Stripe)? Align Terms, Privacy, Stripe, Meta business verification and app store-type listings.
- Do we need a separate Cookie Policy, Acceptable Use Policy, DPA, SLA, Subprocessor list page and Refund Policy as standalone documents?
- Meta/WhatsApp: confirm Roosevelt qualifies as a Tech Provider/Solution Partner scenario and what additional contract terms apply when clients connect their own WABAs.
- Is the AI-generated outreach and auto-reply functionality subject to additional disclosure rules (bot disclosure laws, FTC endorsement guidance, state chatbot laws)?
- Biometric/voice features (voice center, meet agents): any recording/consent obligations (two-party consent states, BIPA-type laws)?
- Data retention periods: set by law and by contract; confirm schedule.
- Insurance, indemnities, and the enforceability of browse-wrap acceptance for B2B and consumer users.

## 10. Engineering follow-ups that legal may require

- Account self-deletion (and export) flow; automated deletion of integration tokens and channel data; deletion-request log.
- Store timestamped acceptance of Terms/Privacy version at sign-up (clickwrap).
- Cookie-consent banner for the company site (GA) in the EEA/UK/CA; or remove GA.
- Meta Data Deletion Callback (optional alternative to the instructions URL) and a status page.
- Subprocessor list page and DPA download.
- Move remaining gaps in section 7 to done before representing stronger security claims in public text.
