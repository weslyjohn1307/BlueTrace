# Security policy

BlueTraceAI is an active prototype. It has no stable release or guaranteed response time for security fixes. Report issues against the current default branch when you can do so safely.

## Report a vulnerability

Please do not post exploit details, credentials, or sensitive drawing data in a public issue or pull request. Contact the repository owner through the contact information on their GitHub profile. If GitHub private vulnerability reporting is available for this repository, you can use that instead.

Include a short description of the issue, affected files or endpoints, and steps to reproduce it. Do not include real customer drawings or live API keys.

## Credentials and drawing data

- Never commit API keys, passwords, tokens, certificates, `.env` files, or private drawings.
- Keep local credentials in environment variables or an ignored local `.env` file. The variable used for live Meta requests is `MODEL_API_KEY`.
- The app stores takeoff data in a local SQLite database. When a user invokes a Meta-powered feature, the selected drawing content is sent to the Meta Model API for processing. See the README for current behavior.
- Do not place API keys in frontend `VITE_*` variables; those values are included in browser code.
