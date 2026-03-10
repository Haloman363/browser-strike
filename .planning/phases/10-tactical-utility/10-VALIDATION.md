---
phase: 10
slug: tactical-utility
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm test src/systems/FXSystem.test.js |
| **Full suite command** | npm run build && npm test |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (to check for TSL syntax errors).
- **After every plan wave:** Full build and test check.
- **Before `/gsd:verify-work`:** Visual check of grenade effects in-game.
- **Max feedback latency:** 10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | UTIL-02 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | UTIL-01 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | UTIL-03 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `Engine.js` update — support for frame buffer copying / after-image capture.
- [ ] `FXSystem.js` update — support for radial density and surface-aligned compute.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Flash Ghost | UTIL-02 | Post-processing quality. | 1. Detonate flash. 2. Verify "ghost" image fades out slowly. |
| Smoke Lurk | UTIL-01 | Tactical vision check. | 1. Stand at smoke edge. 2. Verify seeing OUT is clearer than seeing IN. |
| Fire Flow | UTIL-03 | Surface interaction check. | 1. Throw molotov on uneven ground. 2. Verify fire follows floor contours. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
