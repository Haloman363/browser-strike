# Security Patterns and Vulnerability Analysis

## 1. Hardcoded Secrets
- **Action:** Identify API keys, secrets, tokens, or credentials.
- **Patterns:**
    - `API_KEY`, `_SECRET`, `PASSWORD`, `TOKEN`, `sk_live`, `accessKeyId`, `secretAccessKey`
    - `-----BEGIN RSA PRIVATE KEY-----`
    - Base64-encoded strings (40+ chars)
- **Remediation:** Move to `.env` (ignored by git) or use a secrets manager.

## 2. Injection Vulnerabilities
- **SQL Injection:** Avoid string concatenation in queries. Use parameterized queries.
- **XSS:** Avoid `innerHTML`, `dangerouslySetInnerHTML`. Use `textContent` or proper sanitization.
- **Command Injection:** Sanitize user input before passing to shell commands or `eval()`.

## 3. Prototype Pollution
- **Action:** Check for unsafe object merging or assignment.
- **Risk:** `Object.assign(obj, userControlledInput)` or `obj[key] = value` where `key` could be `__proto__`.
- **Remediation:** Validate keys against a block-list (`__proto__`, `constructor`, `prototype`) or use `Object.create(null)`.

## 4. Broken Access Control
- **IDOR:** Verify user ownership before accessing resources by ID.
- **Path Traversal:** Sanitize file paths constructed from user input.

## 5. Insecure Data Handling
- **Weak Crypto:** Avoid MD5, SHA1 for security-critical hashing. Use Argon2, bcrypt, or SHA-256+.
- **PII in Logs:** Ensure email, passwords, or personal data are not logged.
- **Insecure Deserialization:** Don't deserialize untrusted data without validation.

## 6. WebSocket Security
- **Origin Check:** Validate the `Origin` header for incoming WebSocket connections.
- **Authentication:** Use tokens or shared secrets for WebSocket sessions.
