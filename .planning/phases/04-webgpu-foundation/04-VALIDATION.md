---
phase: 4
slug: webgpu-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 4 — Validation Strategy

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

- **After every task commit:** Run `npm run build` (to check for TSL syntax and Vite errors)
- **After every plan wave:** Full build check
- **Before `/gsd:verify-work`:** Visual check in Chrome (with WebGPU enabled)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | WGPU-01 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | WGPU-01 | build | `npm run build` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | WGPU-01 | manual | (Visual Inspection) | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `vite.config.js` update — support for `esnext` and top-level await.
- [ ] `WebGPURenderer` mock — for unit tests if necessary (though build/manual is primary for this phase).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebGPU Active | WGPU-01 | Hardware dependent. | 1. Open game. 2. Verify HUD says "Backend: WebGPU". 3. Check console for "WebGPURenderer initialized". |
| Material Fidelity | WGPU-01 | Visual quality check. | 1. Inspect player and wall materials. 2. Verify no missing textures or "magenta" errors. |

---

## Validation Sign-Off

- [ ] All tasks have <automated> verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
