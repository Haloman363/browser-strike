---
phase: 3
slug: hit-registration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/NetworkSystem.test.js src/systems/WeaponSystem.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/systems/NetworkSystem.test.js src/systems/WeaponSystem.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | NET-04 | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | NET-04 | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | NET-04 | integration | `npm test src/systems/WeaponSystem.test.js` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/systems/WeaponSystem.test.js` — stubs for testing authoritative hit detection.
- [ ] `Vault Mock` — Mock SnapshotInterpolation Vault for historical state verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lag-Comp Hit | NET-04 | Visual confirmation of "rewind" accuracy. | 1. Simulate 200ms lag. 2. Shoot at a moving target. 3. Verify hit registers on host and blood appears on client. |
| Confirmation Delay | NET-04 | Ensures blood is NOT predicted. | 1. Shoot enemy. 2. Observe tracer is instant but blood has slight delay matching ping. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
