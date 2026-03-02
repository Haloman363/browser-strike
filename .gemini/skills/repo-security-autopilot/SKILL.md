---
name: repo-security-autopilot
description: Automated end-to-end security auditing and remediation. Scans for secrets, vulnerabilities, and common patterns (XSS, Prototype Pollution), applies fixes, verifies them, and handles the commit/push workflow.
---

# Repo Security Autopilot

This skill automates a comprehensive security audit and remediation lifecycle.

## Workflow

### 1. Research & Scan
Use the following tools in parallel to identify potential security issues:
- **Dependency Scan:** `scan_vulnerable_dependencies` (recursive, ignore node_modules/dist).
- **Secret Search:** `grep_search` for common patterns (API_KEY, SECRET, PASSWORD, sk_live, accessKeyId, secretAccessKey, -----BEGIN).
- **Logic Review:** Refer to [references/security-patterns.md](references/security-patterns.md) for vulnerability patterns like XSS (`innerHTML`), Prototype Pollution (`Object.assign`), and missing WebSocket Origin checks.

### 2. Strategy & Remediation
- For each identified issue, formulate a targeted fix following the guidance in [references/security-patterns.md](references/security-patterns.md).
- Apply surgical fixes using `replace` or `write_file`.

### 3. Verification & Validation
- **Automated Verification:** Run the bundled script:
  `node scripts/verify_project.cjs`
- **Manual Logic Check:** Review your changes to ensure they solve the security problem without introducing regressions or changing core logic.
- **Bug Fix Loop:** If tests or build fail, diagnose and apply fixes iteratively until verification passes.

### 4. Finality (Commit & Push)
Once verification is successful and the repo is clean:
1. **Gather Info:** `git status && git diff HEAD && git log -n 3`.
2. **Propose Commit:** Generate a clear commit message focused on security remediation (e.g., "Fix: remediate Prototype Pollution and XSS in DebugBridge").
3. **Commit & Push:** Execute `git add .`, `git commit`, and `git push` (using project-specific SSH keys if necessary).

## Trigger Scenarios
- "Audit the project for security issues and fix them."
- "Secure the repository."
- "Perform a security scan and auto-remediate vulnerabilities."
- "Check for keys and tokens, then commit the fixes."
