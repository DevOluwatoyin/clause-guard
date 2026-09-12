# ClauseGuard demo and manual test clauses

Run these in the test Slack workspace with `/clauseguard` followed by the clause. Expected labels are guidance for validating the demo, not legal conclusions.

## 1. High risk — unlimited, one-sided indemnity

```text
The Vendor shall indemnify, defend, and hold harmless Customer and its affiliates from and against any and all claims, damages, liabilities, losses, costs, and expenses arising out of or related to this Agreement, without limitation of any kind.
```

Expected: **high**. The explanation should identify the broad, one-sided, uncapped obligation, and the redline should make the obligation mutual and reasonably limited.

## 2. Low risk — notice clause

```text
Any notice under this Agreement must be in writing and delivered by hand, recognized courier, or email to the addresses specified by each party. A notice is effective when received.
```

Expected: **low**. The explanation should describe the clause as a conventional delivery process; a redline may say “No change needed.”

## 3. Mutual confidentiality

```text
Each party shall protect the other party's Confidential Information using at least reasonable care and shall use it solely to perform this Agreement. These obligations continue for three years after disclosure.
```

Expected: **low** or **medium**, with a balanced explanation of the shared duty and the three-year term.

## 4. Empty input

```text
/clauseguard
```

Expected: a usage hint. The bot must not call OpenAI or crash.

## 5. Long input

Paste a full page of representative contract text. Confirm Slack immediately shows “Analyzing your clause...” and later supplies a result or friendly error.

## 6. API-credit failure

Only if needed for error-path verification, use an API key without balance in a local non-production environment. Expected: an explicit message that the API account has no available credit; no stack trace should appear in Slack.
