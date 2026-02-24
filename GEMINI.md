# Project Context

## Commit & Push Workflow
When the user asks to **commit**, **push**, or **deploy** code, you MUST follow this strict procedure before executing the git commands:

1.  **Security Scan:**
    *   Run `npm audit` to check for known vulnerabilities.
    *   If vulnerabilities are found, run `npm audit fix` automatically.
    *   If critical vulnerabilities persist that cannot be auto-fixed, stop and report them to the user.

2.  **Verification:**
    *   Run `npm run build` to ensure the project compiles without error.
    *   (If a `test` script exists in package.json, run `npm test` as well).

3.  **Git Operations:**
    *   Only if the above steps succeed:
        *   Stage changes: `git add .`
        *   Commit with the user's message (or a generated one if not provided).
        *   Push to the remote repository.
