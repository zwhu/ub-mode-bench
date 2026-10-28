# Task: Auto-disable color when stdout is not a TTY

## Observed behavior

The echo helper emits ANSI color codes even when stdout is piped or
redirected to a file, producing garbage in captured output.

## Expected behavior

- When stdout is a TTY, color output is unchanged.
- When stdout is NOT a TTY, color codes are stripped by default.
- An explicit `color=True` kwarg forces color even on non-TTY.
- An explicit `color=False` kwarg forces no color even on TTY.

## Reproduction

```bash
pytest -q tests/test_echo.py::test_color_auto_disable_on_pipe
```

## Rules

- Edit `src/**` and `tests/**` only.
- Keep the public helper signature backwards compatible.
- No new third-party dependencies.
- Network is disabled.
