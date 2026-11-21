# Cursebreaker

Visitors chat with an AI on the site's home page. The AI acts as a privacy shield: you never see what visitors write. When a visitor presses **Send to owner**, they preview and approve a short, paraphrased AI summary, and that summary is all you receive.

**Stack:** Next.js 15 (App Router) · Postgres + Drizzle · Auth.js (credentials) · Redis rate limiting · Claude (`claude-opus-5-5`) · hosted on Railway.

## How the shield works

1. **Visitors chat at `/`.** No sign-up: each browser gets a random name (e.g. `quiet-otter-42`) and a secret cookie token. Replies stream in real time from Claude, using your API key and your system prompt.
2. **Their words are encrypted.** Every message, and the visitor's conversation titles, is encrypted with AES-256-GCM. The key is derived from the visitor's cookie token, which exists only in their browser; the database stores just a hash of the token. The database, backups, and the dashboard hold only ciphertext. A transcript can be decrypted only during a request from that visitor's browser, and only that visitor can scroll back through it.
3. **The visitor decides what you get.** Nothing reaches you until the visitor presses **Send to owner**. Claude then writes a topic and summary of the conversation, and the visitor sees exactly that preview. They can send it, or keep chatting to change it and preview again. After sending, they can send updates the same way. Fixed rules, which you can't edit from the dashboard: paraphrase instead of quoting, remove names and other identifying details, honor the visitor's requests to leave things out, and flag urgent risks (harm to self or others, threats, abuse, manipulation) in general terms. The summary is always generated on the server, so visitors can't substitute their own text.
4. **Visitors are told.** The chat page and greeting explain that nothing is shared until they press Send, and that the owner then sees only the summary. The AI is instructed to explain this honestly if asked, and not to promise absolute secrecy, since conversations are still processed by the AI provider.

Things to know:
- If a visitor clears their cookies, their transcript becomes permanently unreadable to everyone. Summaries they've sent stay.
- Urgent flags reach you only if the visitor sends the conversation. In the moment, the chat AI is instructed to respond to anyone at risk and share crisis resources.
- Visitor words exist in plaintext only in server memory during a request, and in transit to Anthropic's API. They are never written to the database or logs.
- This is a guarantee about stored data. Whoever controls the server code could still change it to capture messages in transit, so visitors are trusting the deployment.

## Your dashboard (`/admin`)

- **Conversations:** only conversations visitors have sent, newest first. Summary cards (unread, sent today, chat messages today, flagged, visitors this week), a 14-day activity chart, and Inbox / Unread / Flagged / Archived / All views. Search covers topics and summaries. Refreshes every 20 seconds.
- **Conversation** (`/admin/conversations/[id]`): the approved AI summary, when it was sent, whether the visitor kept chatting afterward, message count, token usage, the visitor's other conversations, and actions: mark unread, flag, archive, block visitor, delete.
- **Visitors:** every anonymous visitor with their conversation and message counts. Block or unblock them here.
- **Settings:** the AI's system prompt, what the summaries should focus on, and the greeting (owners can edit).
- **Audit:** every admin action.

### Email notifications (Resend)

Set `RESEND_API_KEY` and `NOTIFY_EMAIL_TO` (comma-separated for several) to get an email whenever a visitor sends you a summary; flagged ones say "⚠️ Flagged" in the subject. The email contains only the approved summary and a link to the conversation in your dashboard (set `APP_URL`). For delivery to any address, verify your domain in Resend and set `NOTIFY_EMAIL_FROM`, e.g. `Cursebreaker <notify@yourdomain.com>`; until then Resend's test sender only delivers to your Resend account's own email. Use **Settings → Send test email** to check the setup.

## Limits and cost

Each visitor message is one Claude call (the streamed reply), and each summary preview is one more at low effort. Both include the conversation so far; prompt caching keeps the repeated history in replies cheap. Previews are limited to 10 per visitor per hour. Defaults:

- `CHAT_PER_MINUTE` 8 and `CHAT_PER_DAY` 300 per visitor
- `CHAT_MESSAGES_PER_HOUR` 2000 site-wide (your spend cap)
- `MAX_MESSAGE_LENGTH` 4000 characters
- `MAX_CONVERSATION_MESSAGES` 200 per conversation
- `CHAT_EFFORT` `low`. Raise it to `medium` or `high` for more thorough answers at higher cost and latency.

If Claude's safety classifiers decline, the request automatically falls back to another model. If that also declines, the visitor sees a short "can't help with that" and the transcript records `refusal`.

## Local development

```bash
docker run -d --name cb-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=board -p 5432:5432 postgres:17
cp .env.example .env.local      # set AUTH_SECRET and ANTHROPIC_API_KEY
npm install
set -a; . ./.env.local; set +a
npm run db:migrate
npm run admin:create -- you@example.com owner   # prompts for a password (12+ chars)
npm run dev                                      # chat at /, dashboard at /login
```

After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.

## Deploying to Railway

1. In Railway, choose **New Project → Deploy from GitHub repo** and pick this repository. `railway.json` handles the build, start, and healthcheck, and runs `npm run db:migrate` before each deploy.
2. In the same project, add **Postgres** and **Redis** (New → Database).
3. On the app service, open **Variables** and add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - `AUTH_SECRET` = a long random string (e.g. `openssl rand -base64 32`)
   - `ANTHROPIC_API_KEY` = your Anthropic API key
   - `APP_NAME` = your site's name
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters): your dashboard login, created automatically on the first deploy
4. Under **Settings → Networking**, click **Generate Domain**.
5. Once the deploy is green, sign in at `https://<your domain>/login`, then **delete `ADMIN_PASSWORD`** from the variables. The login keeps working.
6. In **Settings** on the dashboard, adjust the system prompt and summary instructions, then share `https://<your domain>/`.
7. **Retention (optional):** add a second service from the same repo with start command `node scripts/retention.mjs`, a cron schedule such as `0 4 * * *`, and `DATABASE_URL` plus `RETENTION_DAYS`. Set the same `RETENTION_DAYS` on the app service so the privacy page states it.
8. Enable Postgres backups in Railway.

To add more admins later, copy `DATABASE_PUBLIC_URL` from the Postgres service and run `DATABASE_URL='<public url>' npm run admin:create -- someone@example.com moderator` from your machine.

## Privacy page

`/privacy` explains to visitors what is stored, what the owner sees, the AI provider's role, and how to delete conversations. Review it before launch and adjust it to your situation. It is a plain-language notice, not legal advice.
