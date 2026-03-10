---
phase: 9
slug: strategic-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/GameState.test.js src/systems/UISystem.test.js |
| **Full suite command** | npm test |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test src/GameState.test.js`
- **After every plan wave:** Full build and test check.
- **Before `/gsd:verify-work`:** Visual check of Buy Menu in-game.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | GAME-02 | unit | `npm test src/GameState.test.js` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | GAME-02 | unit | `npm test src/GameState.test.js` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 2 | GAME-02 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/GameState.test.js` — unit tests for cash rewards and inventory persistence logic.
- [ ] `Buy Menu Mock` — ensure the SVG/Radial menu doesn't break unit tests in non-DOM environments.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Buy Menu UI | GAME-02 | Visual design check. | 1. Open menu with 'B'. 2. Verify radial layout. 3. Buy AK47 and verify cash deduction. |
| Survival Save | GAME-02 | Persistence check. | 1. Buy expensive weapon. 2. Win/Survive round. 3. Verify weapon remains in inventory next round. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
