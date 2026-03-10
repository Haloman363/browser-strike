---
phase: 8
slug: game-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/BombSystem.test.js src/GameState.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/systems/BombSystem.test.js src/GameState.test.js`
- **After every plan wave:** Full build and test check.
- **Before `/gsd:verify-work`:** Visual check of round transitions in-game.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | GAME-01 | unit | `npm test src/GameState.test.js` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | GAME-01 | unit | `npm test src/systems/BombSystem.test.js` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | GAME-01 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/GameState.test.js` — unit tests for round state transitions (PREROUND -> RUNNING -> POSTROUND).
- [ ] `src/systems/BombSystem.test.js` — unit tests for defusal hold logic and kit detection.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Round Reset | GAME-01 | Hardware dependent. | 1. Win round. 2. Verify 5s announcement UI. 3. Verify teleport back to spawn. |
| Defuse Hold | GAME-01 | Visual feedback check. | 1. Plant bomb. 2. Hold 'B'. 3. Verify progress bar appears. 4. Release 'B' and verify reset. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
