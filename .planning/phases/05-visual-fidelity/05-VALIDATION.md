---
phase: 5
slug: visual-fidelity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 5 — Validation Strategy

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
| 5-01-01 | 01 | 1 | WGPU-03 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | WGPU-03 | unit | `npm test src/Factory.test.js` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 2 | WGPU-02 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/Factory.test.js` — check that returned materials are `MeshStandardNodeMaterial`.
- [ ] `PostProcessing Mock` — ensure `PostProcessing` and `pass()` nodes don't break unit tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PBR Look | WGPU-03 | Visual quality check. | 1. Observe weapons in light. 2. Verify metallic surfaces have highlights. 3. Verify polymer has high roughness. |
| CRT Effect | WGPU-02 | Subjective perception. | 1. Open game. 2. Verify scanlines are visible across the whole screen. 3. Verify RGB subpixel shift. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
