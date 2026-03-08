---
phase: 7
slug: gunplay-refinement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/WeaponSystem.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/systems/WeaponSystem.test.js`
- **After every plan wave:** Full build and test check.
- **Before `/gsd:verify-work`:** Visual check of spray patterns in-game.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | GAME-03 | unit | `npm test src/systems/WeaponSystem.test.js` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | GAME-04 | unit | `npm test src/systems/WeaponSystem.test.js` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 2 | GAME-03 | integration | `npm test src/systems/UISystem.test.js` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/systems/WeaponSystem.test.js` — unit tests for recoil index tracking and spread calculation.
- [ ] `Box-Muller Validation` — ensure the Gaussian distribution helper returns values within expected stdDev.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pattern Recog | GAME-03 | Visual skill check. | 1. Fire full clip at a wall. 2. Verify "7" shape for AK-47. 3. Repeat to confirm determinism. |
| Inaccuracy Feel | GAME-04 | Perception of penalty. | 1. Run and shoot. 2. Verify crosshair expands. 3. Verify shots hit far outside the center. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
