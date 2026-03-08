---
phase: 1
slug: networking-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest / Vitest (already in project) |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/NetworkSystem.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/systems/NetworkSystem.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | NET-01 | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | NET-01 | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | NET-01 | integration | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/systems/NetworkSystem.test.js` — unit tests for PeerJS initialization and state sync.
- [ ] `PeerJS Mock` — Mock PeerJS for unit tests to avoid network calls.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client Join | NET-01 | Requires two browser windows/instances. | 1. Start host in tab A. 2. Copy Lobby Code. 3. Join in tab B. 4. Verify movement sync. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
