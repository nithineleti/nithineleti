# Security Model

## Primary threat

A repository can contain arbitrary executable code. Running its tests can execute destructive commands, exfiltrate credentials, consume resources, or attack the host/network. A public deployment must therefore treat repository execution as hostile.

## Controls implemented in this package

- HTTP(S)-only remote repository URL validation.
- Localhost repository URL blocking.
- Repository size limits.
- Source-file size limits and generated/vendor-directory exclusions.
- Clean per-run workspaces.
- Patch path-traversal protection.
- Single-occurrence edit checks for deterministic patches.
- Test wall-clock timeout.
- Changed-file limit.
- Added-line scan for likely credential/secret patterns.
- Warnings for selected dynamic execution/shell constructs.
- scrypt password hashing with per-user random salts.
- HMAC-signed expiring bearer sessions.
- User ownership checks for projects and runs.
- Environment-based secrets/configuration.
- Human approval after automated review.
- API and database readiness checks.
- Nginx security headers in the container deployment.

## Required hardening for public untrusted repositories

The included local process runner is for trusted development/semester demonstrations. For public multi-tenant operation, move repository execution into an isolated execution plane with:

- ephemeral VM/container per run,
- non-root execution,
- read-only base image,
- CPU, memory, process and disk quotas,
- strict wall-clock termination,
- no host filesystem mounts,
- no production secrets in the worker environment,
- metadata-service blocking,
- network disabled by default,
- allowlisted dependency proxy only when necessary,
- egress filtering,
- malware/image scanning,
- centralized audit logs,
- rate limits and per-user repository quotas.

## Credentials

Never commit `.env`. Rotate `APP_SECRET`, database credentials, demo credentials, and any optional inference token before deployment. Production inference credentials belong only on worker infrastructure, not in browser code.

## Human control

CodePilot creates a validated branch/commit and PR preview. It does not automatically merge. Passing tests are strong evidence, not a mathematical proof that a patch is safe in every business context.
