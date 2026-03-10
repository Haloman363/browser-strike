---
phase: 01-networking-core
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [package.json, vite.config.js, src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js, src/utils/LobbyUtils.js, src/utils/LobbyUtils.test.js]
autonomous: true
requirements: [NET-01]
must_haves:
  truths:
    - "Project dependencies for networking and testing are installed"
    - "NetworkSystem can be registered with the Engine"
    - "Short Lobby Codes can be generated and validated"
  artifacts:
    - path: "src/systems/NetworkSystem.js"
      provides: "PeerJS integration and system lifecycle"
    - path: "src/utils/LobbyUtils.js"
      provides: "Short-code generation logic"
    - path: "src/systems/NetworkSystem.test.js"
      provides: "Test suite for networking logic"
  key_links:
    - from: "src/systems/NetworkSystem.js"
      to: "peerjs"
      via: "import and instantiation"
---

<objective>
Establish the technical infrastructure for networking and create the core NetworkSystem skeleton.

Purpose: Provide the foundational libraries and system registration needed for P2P communication.
Output: Configured environment, base NetworkSystem, and utility for lobby codes.
</objective>

<execution_context>
@/home/jaymes/.gemini/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/01-networking-core/01-CONTEXT.md
@.planning/phases/01-networking-core/01-RESEARCH.md
@.planning/phases/01-networking-core/01-VALIDATION.md
@src/core/Engine.js
</context>

<tasks>

<task type="auto">
  <name>Task 0: Infrastructure & Test Environment Setup</name>
  <files>package.json, vite.config.js</files>
  <action>
    Install core networking and testing dependencies:
    - `npm install peerjs @geckos.io/snapshot-interpolation`
    - `npm install -D vitest jsdom`
    
    Update `vite.config.js` to include a `test` block with `environment: 'jsdom'` and `globals: true`.
  </action>
  <verify>
    <automated>npx vitest --version</automated>
  </verify>
  <done>Dependencies installed and Vitest configured.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 1: Lobby Code Generation Utility</name>
  <files>src/utils/LobbyUtils.js, src/utils/LobbyUtils.test.js</files>
  <behavior>
    - `generateLobbyCode()`: Returns a 6-character alphanumeric string.
    - `isValidLobbyCode(code)`: Returns true for 6-char alphanumeric, false otherwise.
  </behavior>
  <action>
    Implement utility functions for generating and validating short, human-readable lobby codes. 
    These codes will serve as the PeerID for the Host.
  </action>
  <verify>
    <automated>npx vitest src/utils/LobbyUtils.test.js</automated>
  </verify>
  <done>Lobby utility implemented and tested.</done>
</task>

<task type="auto">
  <name>Task 2: NetworkSystem Skeleton & PeerJS Mock</name>
  <files>src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js</files>
  <action>
    1. Create `NetworkSystem` class extending `System`.
    2. Register `systemName = 'NetworkSystem'`.
    3. Implement `init()` to instantiate `this.peer = new Peer()`.
    4. Create a test file that mocks `peerjs` to verify that `NetworkSystem` initializes correctly and creates a Peer instance.
  </action>
  <verify>
    <automated>npx vitest src/systems/NetworkSystem.test.js</automated>
  </verify>
  <done>NetworkSystem registered with Engine and PeerJS initialized.</done>
</task>

</tasks>

<verification>
Run `npx vitest` to ensure both utility and system tests pass.
</verification>

<success_criteria>
- `peerjs` and `vitest` are present in `package.json`.
- `NetworkSystem` is a valid `System` that initializes a Peer instance.
- Short codes (e.g. "A1B2C3") can be generated reliably.
</success_criteria>

<output>
After completion, create `.planning/phases/01-networking-core/01-01-SUMMARY.md`
</output>
