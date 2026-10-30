# Claude API notes for this project

Authoritative for the `Api` module. Where this file conflicts with SPEC.md
sections 2, 10 or 13, this file wins: the spec was written against an older
API surface and several of its assumptions now return HTTP 400.

Source: Anthropic's claude-api reference (October 2026).

## Request

```
POST https://api.anthropic.com/v1/messages
content-type: application/json
x-api-key: <player's key>
anthropic-version: 2026-10-21
anthropic-dangerous-direct-browser-access: true
```

Minimal body:

```json
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 1500,
  "system": [{ "type": "text", "text": "...", "cache_control": { "type": "ephemeral" } }],
  "messages": [{ "role": "user", "content": "..." }]
}
```

`system` may also be a plain string. `messages[0]` must be `user`. Never end
`messages` with an `assistant` message (prefill): it returns 400.

## Models

| Role | Default | Notes |
|---|---|---|
| Narrator | `claude-opus-5-5` | $4 / $20 per MTok in/out, cache read $0.20 |
| Parser, bookkeeper, chronicle | `claude-sonnet-5-5` | $2 / $10 per MTok in/out, cache read $0.20 |
| Also valid | `claude-haiku-5-5` | $0.10 / $0.50 per MTok (prompts under 100K), cache read 0.1x; the original cheap default |

Use these exact strings. Never append a date suffix. Both are editable in
Settings, so the request body must not contain anything model-specific.

## Never send these (400 on current models)

- `temperature`, `top_p`, `top_k` at any value. Removed in API version 2026-10-21.
- `thinking` in any form. `{"type":"disabled"}` is a 400 on Sonnet 5.5;
  `budget_tokens` is a 400 everywhere. Omit the field: adaptive thinking runs
  by default on every current model and `output_config.effort` controls depth.
- `tool_choice` of type `tool` or `any`. 400 on Sonnet 5.5 and Opus 5.5.
  SPEC.md sections 2 and 10 call for forced tool use; use structured outputs
  instead (next section). Do not define tools at all.
- A trailing `assistant` message (prefill).

## Getting JSON: structured outputs

Replace every "tool with input_schema + forced tool_choice" in the spec with:

```json
"output_config": {
  "effort": "low",
  "format": { "type": "json_schema", "schema": SCHEMA }
}
```

The response then contains one `text` content block whose `text` is JSON that
conforms to SCHEMA. `JSON.parse` it. Still validate ids and clamp numbers in
code: the schema guarantees shape, not sense.

Schema rules the API enforces:

- Every object, nested ones included, needs `"additionalProperties": false`.
- Supported: `object`, `array`, `string`, `integer`, `number`, `boolean`,
  `null`, `enum`, `const`, `anyOf`, `required`, `description`.
- Not supported (400): `minimum`, `maximum`, `minLength`, `maxLength`,
  recursive schemas, `additionalProperties` set to anything but `false`.
  Enforce ranges in `State.apply`, not in the schema.
- Safest shape: list every property in `required` and make optional ones
  nullable with `"anyOf": [{ "type": "string" }, { "type": "null" }]`.
- Schema objects used by the spec's bookkeeper as bare `{ "type": "object" }`
  (conditionsAdded, threadUpdates, newSeeds) must be spelled out fully:
  the API needs concrete properties and `additionalProperties: false`.

A new schema costs one-time compilation latency on first use, then is cached
for 24 hours. If `stop_reason` is `max_tokens` the JSON may be cut off: treat
as a failure and retry once with a higher `max_tokens`. If `stop_reason` is
`refusal` the output will not match the schema.

## Effort and max_tokens

Thinking is on by default and its tokens count toward `max_tokens`. The
spec's limits (300 / 400 / 600 / 200) are too small for that. Use:

| Call | effort | max_tokens |
|---|---|---|
| Narrator | `medium` | 3000 |
| Parser | `low` | 2000 |
| Bookkeeper | `medium` | 4000 |
| Chronicle | `medium` | 2000 |

Keep narration short through the prompt and the style check, not through
`max_tokens`. Expose effort per role in Settings (`low`, `medium`, `high`).

## Streaming (narrator only)

Add `"stream": true`. The body is Server-Sent Events:

```
event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The "}}

```

Read `response.body.getReader()`, decode with `TextDecoder`, split on blank
lines, take lines starting with `data: `, `JSON.parse` the rest.

| event `type` | What to do |
|---|---|
| `message_start` | `message.usage.input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| `content_block_start` | `content_block.type` is `thinking` or `text`. Note the index of the text block. |
| `content_block_delta` | `delta.type`: `text_delta` → append `delta.text`. `thinking_delta` and `signature_delta` → ignore. |
| `content_block_stop` | nothing |
| `message_delta` | `delta.stop_reason`, `usage.output_tokens` |
| `message_stop` | done |
| `ping` | ignore |
| `error` | `error.type`, `error.message`: surface it |

Thinking blocks arrive first with empty text; render nothing for them.

## Non-streaming response

```json
{
  "id": "msg_...", "type": "message", "role": "assistant", "model": "...",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "stop_details": null,
  "usage": { "input_tokens": 0, "output_tokens": 0,
             "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0 }
}
```

`content` may start with a `thinking` block. Find the block with
`type === "text"`; never assume index 0.

`stop_reason`: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`,
`pause_turn`, `refusal`. On `refusal`, `stop_details` is
`{ "type": "refusal", "category": "...", "explanation": "..." }`. Show a
short in-feed notice ("The narrator declined that one. Try it another way.")
and keep the player's input. Haiku 5.5 has no server-side fallback and this
project does not use the fallback beta.

## Prompt caching

- Narrator `system` is one text block, byte-identical every turn:
  `STYLE_GUIDE` + the example turns, with
  `"cache_control": { "type": "ephemeral" }`. No dates, names, state or
  settings inside it. Everything volatile goes in the user message.
- Minimum cacheable prefix on Sonnet 5.5 and Haiku 5.5 is 512 tokens. The
  style guide plus examples is about 700, so it caches. The parser and
  bookkeeper system prompts are shorter and simply will not cache; that is
  fine, do not pad them.
- Caches are per model: changing the narrator model starts cold.
- Verify: on the second narration of a session,
  `usage.cache_read_input_tokens > 0`. Show these fields in debug view.

## Errors

Non-2xx body:

```json
{ "type": "error", "error": { "type": "rate_limit_error", "message": "..." } }
```

| Status | `error.type` | Handling |
|---|---|---|
| 400 | `invalid_request_error` | Bug in our request. Show the message verbatim in debug, friendly text in the feed. No retry. |
| 401 | `authentication_error` | Bad key. Point to Settings. No retry. |
| 403 | `permission_error` | No retry. |
| 404 | `not_found_error` | Usually a bad model name. Point to Settings. |
| 429 | `rate_limit_error` | Retry once after 1.5 s. |
| 500 | `api_error` | Retry once. |
| 529 | `overloaded_error` | Retry once after 1.5 s. |
| network / fetch throws | | Retry once after 1.5 s. |

Log the `request-id` response header with every failure in debug view.

## Cost estimate (debug view)

cost = input × in_rate + output × out_rate + cache_read × read_rate +
cache_creation × in_rate × 1.25, using the table under Models, by model id;
unknown model id → show tokens only.

## 30 Oct 2026: Changes made for the 1-hour cache and Check key

What the `Api` module now sends and reads, beyond the sections above. None
of it has been sent to the live API yet: it is checked in mock mode and
against canned replies (`tests/api.test.cjs`, `tests/transport-fixes.test.cjs`).

- **Cache TTL.** The narrator's three system blocks (style guide, town, cast)
  carry `"cache_control": { "type": "ephemeral", "ttl": "1h" }`. Without
  `ttl` the cache lasts five minutes. When the last narration was more than
  50 minutes ago, the parse step also sends a pre-warm call with the same
  three blocks, `max_tokens: 1`, effort `low`, not streamed, in parallel
  with the parser; its usage is counted and a failure is only logged.
- **Usage.** `usage.cache_creation.ephemeral_1h_input_tokens` and
  `ephemeral_5m_input_tokens` split `cache_creation_input_tokens` by TTL.
  When the split is missing, every cache write is counted as a 1-hour write.
  Usage from every attempt of a retried call is added up.
- **Write price.** A 1-hour cache write costs 2× the input rate (a 5-minute
  write 1.25×). The cost formula above becomes: input × in_rate + output ×
  out_rate + cache_read × read_rate + write_5m × in_rate × 1.25 + write_1h ×
  in_rate × 2. A dated model id (`claude-opus-5-5-20261001`) is priced as
  its model.
- **Check key.** `GET https://api.anthropic.com/v1/models` with the same
  headers as a message (`x-api-key`, `anthropic-version`,
  `anthropic-dangerous-direct-browser-access`), no body, a 20 s timeout. 200
  means the key works; any other status gets the same friendly line as a
  failed message call (401: a bad key), with the API's own message kept as
  the detail. No tokens are spent. A key that is not printable ASCII with no
  spaces (`/^[\x21-\x7e]+$/`, often a zero-width space from copying) is
  never sent.
- **retry-after.** One retry on 429, 500, 502, 503, 504, 529, a network
  error, a timeout, a stream that ends before `message_stop`, a mid-stream
  `error` event of type `overloaded_error` or `api_error`, and a body that is
  not JSON. The wait is the `retry-after` header (seconds or an HTTP date),
  held to at most 10 s, else 1.5 s; a reply that does not parse, or a broken
  stream, retries at once. This replaces the fixed 1.5 s in the Errors table.
- **Idle timeouts.** Every call runs under an `AbortController`. A stream
  gives up after 45 s with no bytes (each chunk resets the timer); a
  non-streaming call after 120 s in all. Stop aborts every call in flight.
- **`record_changes`.** The bookkeeper's schema gained `npcFates`,
  `memoriesSettled` and `obligationsSettled`, and lost
  `attitudeChanges[].reason`, `newSeeds[].cause` and the nested
  `newSeeds[].trigger` object (now flat `triggerType` / `triggerValue`), for
  45 properties counted the way the grammar counts them (every property of
  every nested object). An earlier live probe passed 46 and refused 47 with
  "compiled grammar too large". The 45-property schema still needs a live
  probe.
