# ClauseGuard

ClauseGuard is a Slack-native contract clause risk checker for non-lawyers negotiating NDAs, MSAs, and vendor agreements. Run `/clauseguard <clause>` in Slack to receive a private review with a low/medium/high risk label, a plain-English explanation, and a proposed balanced redline.

It keeps the review in the negotiation channel instead of forcing a context switch. It provides educational information only, not legal advice.

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env`, then add your Slack bot token, Slack signing secret, and OpenAI API key.
4. Start the app with `npm run dev`.
5. In another terminal, run `ngrok http 3000` and copy the HTTPS forwarding URL.

## Slack app setup

At [api.slack.com/apps](https://api.slack.com/apps), create a new app from scratch in a test workspace you control.

1. Under **Slash Commands**, create `/clauseguard`; use `https://YOUR-NGROK-URL/slack/events` as the Request URL.
2. Under **Interactivity & Shortcuts**, turn Interactivity on and use that same Request URL.
3. Under **OAuth & Permissions**, add `commands` and `chat:write` bot token scopes.
4. Install the app to the workspace, then copy the Bot User OAuth Token and Signing Secret into `.env`.
5. Restart the app and test `/clauseguard The Vendor shall indemnify the Customer for all claims without limitation.`

## Commands

```text
/clauseguard <paste one contract clause here>
```

The bot immediately acknowledges Slack's request, then posts the result ephemerally to the person who invoked it.

## Verification

```bash
npm run build
npm test
```

Before recording a demo, test high-risk, low-risk, mutual-confidentiality, empty-input, long-input, and malformed-model-output cases in your test workspace.
