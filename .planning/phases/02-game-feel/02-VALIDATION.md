---
phase: 2
slug: game-feel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/NetworkSystem.test.js src/systems/PlayerControllerSystem.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/systems/NetworkSystem.test.js src/systems/PlayerControllerSystem.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | NET-02 | unit | `npm test src/systems/PlayerControllerSystem.test.js` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | NET-03 | unit | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | NET-03 | integration | `npm test src/systems/NetworkSystem.test.js` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/systems/PlayerControllerSystem.test.js` — stubs for testing client-side prediction logic.
- [ ] `Network Mock` — Ensure network state snapshots can be injected for reconciliation tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prediction Feel | NET-02 | Subjective perception of responsiveness. | 1. Simulate 100ms lag. 2. Move player. 3. Verify movement is instant on local screen. |
| Reconciliation Snap | NET-03 | Visual feedback on major desync corrections. | 1. Introduce fake drift on host. 2. Verify client snaps to correct position after threshold. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
