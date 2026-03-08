---
phase: 01-networking-core
plan: 02
type: execute
wave: 2
depends_on: [01-01]
files_modified: [src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js]
autonomous: true
requirements: [NET-01]
must_haves:
  truths:
    - "System can differentiate between Host and Client roles"
    - "Client establishes two separate WebRTC data channels (reliable and unreliable)"
    - "Host can accept incoming PeerJS connections"
  artifacts:
    - path: "src/systems/NetworkSystem.js"
      provides: "Connection lifecycle methods (host, join, send)"
  key_links:
    - from: "src/systems/NetworkSystem.js"
      to: "LobbyUtils"
      via: "import for PeerID mapping"
---

<objective>
Implement the Host/Client handshake and the mixed reliability channel architecture.

Purpose: To allow peers to find each other via lobby codes and establish the necessary data paths for both events and state.
Output: Role-aware NetworkSystem with dual-channel connection management.
</objective>

<execution_context>
@/home/jaymes/.gemini/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-networking-core/01-01-SUMMARY.md
@.planning/phases/01-networking-core/01-CONTEXT.md
@.planning/phases/01-networking-core/01-RESEARCH.md
@src/systems/NetworkSystem.js
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Role Identification & Connection Logic</name>
  <files>src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js</files>
  <behavior>
    - `host(code)`: Initializes PeerJS with specified ID, sets `isHost = true`.
    - `join(code)`: Attempts connection to host, sets `isHost = false`.
    - Correct event listeners for 'connection' (Host) and 'open' (Client) are registered.
  </behavior>
  <action>
    Implement role-based methods in `NetworkSystem`. Ensure the host listens for incoming connections while the client initiates them using the lobby code.
  </action>
  <verify>
    <automated>npx vitest src/systems/NetworkSystem.test.js</automated>
  </verify>
  <done>Host and Join functionality implemented and tested.</done>
</task>

<task type="auto">
  <name>Task 2: Mixed Reliability Channels & Handshake</name>
  <files>src/systems/NetworkSystem.js</files>
  <action>
    1. Update `join(code)` to open two connections: one with `reliable: true` (label: 'reliable') and one with `reliable: false` (label: 'unreliable').
    2. Implement `send(type, data, reliable = true)` method that routes messages to the correct channel.
    3. Implement a basic handshake where the client sends a `JOIN` message over the reliable channel once both are open.
  </action>
  <verify>
    <automated>npx vitest src/systems/NetworkSystem.test.js</automated>
  </verify>
  <done>Dual channels established and initial handshake message sent.</done>
</task>

</tasks>

<verification>
Verify by running unit tests that simulate a host being initialized and a client attempting a connection with two labels.
</verification>

<success_criteria>
- `NetworkSystem` has `host()` and `join()` methods.
- Connections are established with distinct labels ('reliable', 'unreliable').
- Host registers client peer IDs upon successful handshake.
</success_criteria>

<output>
After completion, create `.planning/phases/01-networking-core/01-02-SUMMARY.md`
</output>
