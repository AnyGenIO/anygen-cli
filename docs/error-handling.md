# Error Handling

> Applies to: all dynamic commands (`commands/dynamic.ts`), helper commands (`commands/task-download.ts`), and auth commands (`commands/auth-cmd.ts`).

---

## Design Principles

1. **Structured output, always** — Success `{"success":true, ...}`, failure `{"success":false, "error":{...}}`. Callers only need one JSON parsing path.
2. **stderr for humans, stdout for machines** — Interactive messages (Error + Usage) go to stderr; JSON envelopes go to stdout.
3. **Classify, don't just relay** — Server error codes are mapped to meaningful types with fix hints.

---

## JSON Envelope

### Success

```json
{
  "success": true,
  "task_id": "task_xxx",
  "task_url": "https://www.anygen.io/task/xxx",
  "content_version": 1
}
```

### Error

```json
{
  "success": false,
  "error": {
    "type": "validation",
    "message": "Missing --data (required fields: operation, prompt)",
    "hint": "Run: anygen schema task.create"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | `true` on success, `false` on error |
| `error.type` | string | Machine-readable error classification (see table below) |
| `error.message` | string | Human-readable error description |
| `error.hint` | string? | Fix suggestion (can be used as a command) |

### error.type Enum

| type | Description | Source |
|------|-------------|--------|
| `validation` | Parameter check failed (missing field, bad format) | CLI client-side |
| `auth` | Authentication failed (invalid key, expired, login required) | CLI or server (100004003, 100004004) |
| `permission` | Authenticated but insufficient credits/permissions | Server (100006029) |
| `rate_limit` | Rate limited | Server (100004006, 100004012) |
| `api_error` | General API error (catch-all for server errors) | Server (5xxx, 6xxx, 7xxx) |
| `network` | Cannot reach server | CLI |
| `internal` | CLI bug (should not happen) | CLI |

> Defined in: `src/errors.ts`

---

## Error Classification

`classifyServerError()` in `src/errors.ts` maps AnyGen server error codes to CLI error types:

| Server Code | → type | → hint |
|-------------|--------|--------|
| 100004003 (forbidden) | `auth` | `Run: anygen auth login` |
| 100004004 (login required) | `auth` | `Run: anygen auth login` |
| 100004001 (param error) | `validation` | — |
| 100004006, 100004012 (rate limit) | `rate_limit` | `Please retry after a short wait.` |
| 100006029 (credits insufficient) | `permission` | `Check your credits at https://www.anygen.io` |
| 100004xxx (other client errors) | `validation` | — |
| 100005xxx+ (server errors) | `api_error` | — |
| No code, message contains "api key" | `auth` | `Run: anygen auth login` |
| No code, fallback | `api_error` | — |

> Server error codes defined in: `mino_server/biz/pkg/errcode/const.go`

---

## stderr Output

All errors print `Error: <message>` + command usage to stderr before outputting the JSON envelope to stdout:

```
Error: Missing --data (required fields: operation, prompt)
Usage: anygen task create [options]

Options:
  --data <json>  Request body as JSON
  --dry-run      Show the request without sending it
  -h, --help     display help for command
```

This matches larksuite-cli's cobra error output pattern.

---

## Three-Layer Interception

```
User Input → ① Client Validation → ② Auth/Network Check → ③ Server Response
```

| Layer | Trigger | type | Has hint | Has Error+Usage |
|-------|---------|------|----------|-----------------|
| ① Client validation | Missing `--data`, missing required field, missing `--params` | `validation` | Yes (points to schema) | Yes |
| ② Auth/network | Invalid key, network down, credits exhausted | `auth` / `network` | Yes | Yes |
| ③ Server error | API returns `success: false` or HTTP non-200 | Classified via `classifyServerError` | Depends | Yes |

---

## Usage Patterns

### Agent / Programmatic

```python
import subprocess, json

result = subprocess.run(
    ["anygen", "task", "create", "--data", '{"operation":"slide","prompt":"test"}'],
    capture_output=True, text=True
)
response = json.loads(result.stdout)

if response["success"]:
    task_id = response["task_id"]
else:
    error = response["error"]
    if error["type"] == "auth":
        # Re-authenticate
        ...
    elif error["type"] == "rate_limit":
        # Wait and retry
        time.sleep(5)
    elif error["type"] == "validation":
        # Fix parameters, check hint
        print(error.get("hint", ""))
```

### Shell Script

```bash
output=$(anygen task create --data '{"operation":"slide","prompt":"test"}' 2>/dev/null)
if echo "$output" | jq -e '.success' > /dev/null 2>&1; then
    task_id=$(echo "$output" | jq -r '.task_id')
else
    echo "$output" | jq '.error'
fi
```

---

## File Index

| File | Responsibility |
|------|---------------|
| `src/errors.ts` | Error types, constructors, `classifyServerError()`, JSON output |
| `src/commands/execute.ts` | `errorWithHelp()` — stderr Error + Usage + stdout JSON |
| `src/api/auth.ts` | Auth flow errors (throws `CliError`) |
| `src/config/internal-fields.ts` | Fields hidden from schema/dry-run output |
