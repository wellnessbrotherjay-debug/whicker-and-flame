# SignalIQ Content Studio

Hosted at https://signaliq.agency/agency-os/ using the existing HTTPS virtual host. Node service `agency-os-dashboard` binds only 127.0.0.1:3046. The marketing app retains the root route on port 3020.

Environment is held in protected `/opt/n8n/agency-dashboard.env` and `/opt/n8n/agency-os.env`, never in this repository. Owner sign-in is a one-time link emailed to the fixed owner through the existing local Postfix relay. The browser receives only a random 10-minute single-use nonce; after server verification it becomes a signed Secure HttpOnly SameSite cookie (HMAC with AOS_SESSION_SECRET, 7 days). Restarting the server invalidates unused sign-in links; request another if needed. The sign-in button sends email automatically; it does not depend on a WhatsApp reply window. SMTP acceptance is logged by queue ID so delivery can be traced.

Build: `npm ci && npm test && npm run build`. Server: `node --import tsx server/index.ts`.

Deployment: sync source, install locked dependencies, run checks/build, restart the dashboard service. Do not restart or replace the SignalIQ marketing application. Apache backup: `/opt/n8n/aos-backups/2026-10-11/signaliq-before-dashboard.conf`.

Stable content numbers and atomic dashboard actions are database functions in schema `agencyos` (see the main README); the dashboard reaches them only through the Agency OS API.
