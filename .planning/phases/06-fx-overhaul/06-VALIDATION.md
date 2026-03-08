---
phase: 6
slug: fx-overhaul
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite.config.js |
| **Quick run command** | npm run build |
| **Full suite command** | npm run build && npm test |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (to check for TSL syntax errors).
- **After every plan wave:** Full build check.
- **Before `/gsd:verify-work`:** Visual check in Chrome (with WebGPU enabled).
- **Max feedback latency:** 10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | WGPU-04 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | WGPU-04 | unit | `npm test src/systems/FXSystem.test.js` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | WGPU-04 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/systems/FXSystem.test.js` — check that the system correctly registers and initializes.
- [ ] `Compute Shader Mock` — ensure compute nodes don't break unit tests in non-GPU environments.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spark Physics | WGPU-04 | Visual physics check. | 1. Fire gun. 2. Verify sparks fly out and fall with gravity. |
| Smoke Bloom | WGPU-04 | Subjective quality. | 1. Detonate smoke grenade. 2. Verify cloud expands into a dense, soft-edged volumetric shape. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
