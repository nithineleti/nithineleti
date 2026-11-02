# Security and Safety Notes

Implemented safeguards:

- JWT bearer authentication.
- scrypt password hashing with random salt.
- User ownership checks for uploaded documents and reports.
- Workspace/RBAC data model.
- Configurable CORS allowlist.
- Request rate limiting with Redis or memory fallback.
- Prompt-injection pattern detection for research questions.
- Citation validation and grounded extractive fallback.
- File extension and upload-size validation.
- SHA-256 content hashing/deduplication.
- Structured request logging and request IDs.
- Research audit records.
- Secrets expected through environment variables.

Production hardening still required:

- Put TLS and a WAF/reverse proxy in front of the API.
- Use a managed secret store and rotate keys.
- Add MFA/SSO if the product handles institutional data.
- Add malware scanning/sandboxing for uploaded PDFs.
- Enforce workspace scoping across every query in a multi-tenant deployment.
- Add token revocation/refresh, password-reset flows and account lockout controls.
- Encrypt sensitive storage and backups.
- Conduct dependency, SAST/DAST and container image scanning.
- Use licensed/approved financial data sources and appropriate legal review.
- Treat generated outputs as research assistance, never automated trading instructions.
