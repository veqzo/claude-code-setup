# Coding Style

- Prefer immutable data; mutate only where idiom or performance requires it.
- Small focused files (max ~800 lines), organized by feature.
- Handle errors at the right boundary. Never swallow them. Do not leak internals or secrets to API clients.
- Log with the project's logger, not `print` / `println` / `console.log`.
- Async code: propagate cancellation; never block the event loop or the coroutine dispatcher.
- Validate all external input at the boundary (requests, webhooks, Discord events, database).
- No hardcoded secrets, URLs, ports or credentials. Read typed settings from environment variables and fail fast when a required one is missing. Keep `.env.example` complete.
- Before "done": the project's linter, formatter, type checker and relevant tests pass. No debug output or dead code.
