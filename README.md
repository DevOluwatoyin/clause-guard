# ClauseGuard

ClauseGuard is a Slack-native contract clause risk checker for non-lawyers negotiating NDAs, MSAs, and vendor agreements. Paste a clause into `/clauseguard` and receive a private, plain-English risk review without leaving the conversation where the deal is being discussed.

> ClauseGuard provides educational information, not legal advice. Consult qualified legal counsel before accepting, rejecting, or redlining a contract.

## Why Slack?

Contract questions often arise mid-negotiation, when context switching to a separate tool slows the team down. ClauseGuard meets people in Slack, gives the requester an ephemeral result, and turns opaque legal language into an actionable starting point for discussion with counsel.

## What it does

- Labels a pasted clause as **low**, **medium**, or **high** risk.
- Explains the clause in two to three plain-English sentences.
- Suggests a more balanced redline when a change may be warranted.
- Acknowledges the slash command immediately, keeping within Slack's three-second response requirement.
- Validates the model's structured response with Zod before presenting it.

## Who it is for

Non-lawyers negotiating commercial contracts in Slack: founders, sales teams, procurement teams, operations teams, and vendor managers. It is a first-pass review aid—not a replacement for a lawyer.

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env`, then add your Slack bot token, Slack signing secret, and OpenAI API key.
4. Start the app with `npm run dev`.
5. In another terminal, run `ngrok http 3000` and copy the HTTPS forwarding URL. Keep both the app and tunnel running while testing.

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

## Demo checklist

Use the ready-made clauses in [docs/demo-test-clauses.md](docs/demo-test-clauses.md). For a two-minute demo, show:

1. A high-risk, unlimited one-sided indemnity clause.
2. A low-risk notice clause.
3. The resulting risk label, explanation, and redline in Slack.

The full manual test checklist also covers empty input, mutual confidentiality, long text, and unavailable API credit.

## Verification

```bash
npm run build
npm test
```

Before recording a demo, test high-risk, low-risk, mutual-confidentiality, empty-input, long-input, and malformed-model-output cases in your test workspace.

## Troubleshooting

- **Slack cannot verify the Request URL:** The app or ngrok tunnel is not running, or the URL is stale. Restart both processes and update the Slack Request URL with the current ngrok HTTPS URL.
- **ClauseGuard says the OpenAI API account has no available credit:** The configured API key has exhausted its Platform API balance. Add Platform API billing/credits or replace `OPENAI_API_KEY` with a funded key, then restart the app.
- **Slash command is unavailable:** The app was not installed or reinstalled after adding scopes. Reinstall the Slack app to the test workspace.

## Security and privacy

- Never commit `.env` or share its tokens and API key.
- Use only a test Slack workspace for this prototype.
- Do not paste sensitive production contracts into a hackathon demo environment without appropriate permission.
- Slash-command results are ephemeral by default, visible only to the requester.
