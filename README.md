# Browser Strike

A high-performance, web-based first-person shooter prototype built with Three.js and Vite. Experience tactical combat with roaming bots, advanced movement, and peer-to-peer multiplayer.

## 🚀 Features

- **Tactical Gameplay**: Advanced collision system with sub-stepping to prevent phasing, sliding along walls, and realistic scale.
- **Humanoid Bot AI**: Detailed 3D humanoid models with walking animations, roaming logic, and line-of-sight awareness.
- **Advanced FPS Viewmodel**: Immersive first-person arms and hands that grip the weapon naturally, featuring Aim Down Sights (ADS) and recoil recovery.
- **Weapon System**:
  - **Primary**: Customizable gun with muzzle flash, projectile-based effects, and realistic reload animations.
  - **Secondary**: Knife system with dedicated stab animations and short-range high damage.
  - **Ammo Management**: Dropped weapon pickups from eliminated enemies provide ammo replenishment.
- **Multiplayer**: P2P multiplayer lobbies powered by PeerJS. Host a lobby with a unique code or join friends instantly.
- **Dynamic UI**: Classic HUD showing health, ammo, and an "Enemies Alive" counter for solo play. Includes a persistent settings menu (FOV, Sensitivity, View Distance) using LocalStorage.
- **Map Layout**: Detailed environment inspired by iconic tactical shooters, featuring tunnels, pathways, and strategic cover.

## 🎮 Controls

- **W, A, S, D**: Move
- **SPACE**: Jump
- **CTRL**: Crouch
- **1**: Knife
- **2**: Gun
- **R**: Reload
- **MOUSE**: Look
- **LEFT CLICK**: Attack / Shoot
- **RIGHT CLICK**: Aim Down Sights (Gun only)
- **TAB**: View Scoreboard
- **ESC**: Pause Menu

## 🛠️ Technical Stack

- **Engine**: [Three.js](https://threejs.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Networking**: [PeerJS](https://peerjs.com/) (WebRTC)
- **Host**: GitHub Pages

## 📦 Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/Haloman363/browser-strike.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## 🛡️ Security & Performance

- **XSS Mitigation**: Sanitized user inputs and safe DOM manipulation for dynamic UI elements.
- **Network Validation**: Robust packet verification for multiplayer synchronization.
- **Optimization**: Pre-calculated bounding boxes for static world geometry to ensure high frame rates.

---
*Created by Haloman363*
