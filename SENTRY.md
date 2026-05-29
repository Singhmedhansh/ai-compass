Sentry setup

This project is a Python Flask app. Sentry is initialized in `app/__init__.py`.

Required environment variables

- `SENTRY_DSN`: Your project's DSN (public client key). If unset, Sentry will be a no-op.
- `APP_ENV`: `production` / `staging` / `development` (defaults to `development`). Used for Sentry environment.
- `SENTRY_TRACES_SAMPLE_RATE`: Float between 0.0 and 1.0. Defaults to `0.01`.
- `SENTRY_SEND_PII`: `true`/`false` (default `false`). If true, Sentry will include user-identifying data.
- `SENTRY_RELEASE` (optional): set to the current release/version string to link errors to releases.

Quick steps

1. Add the DSN in your environment or CI secrets: `SENTRY_DSN="https://...@o0.ingest.sentry.io/0"`
2. Optionally set `SENTRY_TRACES_SAMPLE_RATE=0.1` to enable transaction tracing.
3. Restart the service.

Notes

- The repo's `requirements.txt` already pins `sentry-sdk`.
- The integration uses `FlaskIntegration` when available so request context and transactions are captured automatically.
- The DSN is public (identifies the project) and safe to store in infra config; do not commit secrets if you prefer not to.

Local testing

To quickly test Sentry locally (no DSN required):

1. Set `SENTRY_DSN` to a real DSN or a valid test DSN.
2. Trigger an exception in a route, or run a snippet that calls `sentry_sdk.capture_exception(Exception("test"))`.

Contact

If you need help locating your DSN: open https://sentry.io/settings/projects/ and copy the "Client Keys (DSN)" value for your project.
