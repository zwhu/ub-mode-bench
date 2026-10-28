# Task: Session timeout is silently dropped

## Observed behavior

Calling the session helper with a `timeout=` kwarg does not raise
`TimeoutError` when the underlying socket stalls past the configured deadline.
Instead the call blocks indefinitely until the OS kills the socket.

## Expected behavior

- A `timeout` passed to the session helper must be enforced per request.
- On stall, the helper raises the library's documented timeout exception.
- Default behavior (no timeout kwarg) is unchanged.

## Reproduction

```bash
pytest -q tests/test_session.py::test_timeout_is_respected
```

The test currently hangs or fails. Make it pass without breaking any other
test, and without changing the public helper signature.

## Rules

- You may edit files under `src/**` and `tests/**` only.
- You may add new tests but not delete existing ones.
- Do NOT read CHANGELOG, HISTORY, or release notes; they have been removed.
- Network is disabled.
