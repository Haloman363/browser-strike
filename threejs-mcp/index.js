import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
dotenv.config();
const server = new Server({
    name: "threejs-mcp-v2",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// --- WebSocket Bridge for Live Updates ---
const WSS_PORT = 8081;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || "DEFAULT_SAFE_TOKEN";
const wss = new WebSocketServer({
    port: WSS_PORT,
    verifyClient: (info, callback) => {
        // 1. Origin Check (Prevent Hijacking)
        const origin = info.origin || "";
        const isLocal = origin.includes("localhost") || origin.includes("127.0.0.1") || origin === "null"; // Allow null for local file testing
        // 2. Token Check (Prevent unauthorized access)
        const url = new URL(info.req.url || "", `http://${info.req.headers.host}`);
        const token = url.searchParams.get("token");
        if (!isLocal || token !== BRIDGE_TOKEN) {
            console.error(`[MCP] Rejected connection from origin: ${origin}`);
            callback(false, 401, "Unauthorized");
            return;
        }
        callback(true);
    }
});
let clients = new Set();
wss.on("connection", (ws) => {
    clients.add(ws);
    console.error("[MCP] Browser client connected to bridge.");
    ws.on("close", () => clients.delete(ws));
});
function broadcast(msg) {
    const payload = JSON.stringify(msg);
    clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN)
            c.send(payload);
    });
}
const THREE_DOCS = {
    "Group": "https://threejs.org/docs/#api/en/objects/Group",
    "Mesh": "https://threejs.org/docs/#api/en/objects/Mesh",
    "ExtrudeGeometry": "https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry",
    "LatheGeometry": "https://threejs.org/docs/#api/en/geometries/LatheGeometry",
    "BoxGeometry": "https://threejs.org/docs/#api/en/geometries/BoxGeometry",
    "TorusGeometry": "https://threejs.org/docs/#api/en/geometries/TorusGeometry",
    "CanvasTexture": "https://threejs.org/docs/#api/en/textures/CanvasTexture",
    "Box3": "https://threejs.org/docs/#api/en/math/Box3",
};
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // --- LIVE BRIDGE TOOLS ---
            {
                name: "live_tweak_weapon",
                description: "Instantly update weapon parameters in the running game via WebSocket.",
                inputSchema: {
                    type: "object",
                    properties: {
                        weaponId: { type: "string" },
                        params: { type: "object", additionalProperties: true }
                    },
                    required: ["weaponId", "params"],
                },
            },
            {
                name: "debug_spawn_enemy",
                description: "Spawn an AI bot at a specific position in the running game.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["grunt", "sniper", "heavy"] },
                        position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } }
                    },
                    required: ["type", "position"],
                },
            },
            // --- ASSET HELPERS (SIMULATING EXTERNAL MCPS) ---
            {
                name: "get_audio_config",
                description: "Generate optimal FFmpeg/WebAudio configuration for game sound assets (Simulates Audio Tweaker MCP).",
                inputSchema: {
                    type: "object",
                    properties: {
                        assetName: { type: "string" },
                        type: { type: "string", enum: ["sfx", "bgm", "ui"] }
                    },
                    required: ["assetName", "type"],
                },
            },
            {
                name: "generate_glb_manifest",
                description: "Create a boilerplate manifest for external 3D model generation (Simulates Tripo/Flux MCPs).",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string" },
                        targetSlot: { type: "string", description: "e.g., primary_weapon, prop, character" }
                    },
                    required: ["prompt", "targetSlot"],
                },
            },
            // --- EXISTING TOOLS ---
            {
                name: "get_docs",
                description: "Get documentation links for Three.js classes.",
                inputSchema: {
                    type: "object",
                    properties: { className: { type: "string" } },
                    required: ["className"],
                },
            },
            {
                name: "generate_mesh_code",
                description: "Generate Three.js code snippet for a specific mesh type.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["box", "sphere", "plane", "cylinder", "torus"] },
                        name: { type: "string" },
                    },
                    required: ["type"],
                },
            },
            {
                name: "calculate_bounding_box",
                description: "Generate code to compute and set a bounding box for collision detection.",
                inputSchema: {
                    type: "object",
                    properties: { variableName: { type: "string" } },
                    required: ["variableName"],
                },
            },
            {
                name: "get_physics_constants",
                description: "Retrieve standard project physics constants (Gravity, Speed, etc).",
                inputSchema: { type: "object", properties: {} },
            }
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
        case "live_tweak_weapon": {
            broadcast({ type: "TWEAK_WEAPON", data: args });
            return { content: [{ type: "text", text: `Sent tweak command for ${args?.weaponId}. Check game console.` }] };
        }
        case "debug_spawn_enemy": {
            broadcast({ type: "SPAWN_ENEMY", data: args });
            return { content: [{ type: "text", text: `Sent spawn command for ${args?.type}.` }] };
        }
        case "get_audio_config": {
            const { assetName, type } = args;
            const bitrate = type === "sfx" ? "128k" : "192k";
            return { content: [{ type: "text", text: `FFmpeg Config for ${assetName}:\n- Format: OGG (Web standard)\n- Bitrate: ${bitrate}\n- Sample Rate: 44.1kHz\n- Optimization: Mono for positional SFX, Stereo for UI.` }] };
        }
        case "generate_glb_manifest": {
            const { prompt, targetSlot } = args;
            return { content: [{ type: "text", text: `GLB Generation Manifest:\n- Prompt: ${prompt}\n- Slot: ${targetSlot}\n- Export: GLTF/GLB\n- Scale: 0.1 (Three.js standard for this project)\n- Orientation: Forward Z+` }] };
        }
        case "get_docs": {
            const className = args?.className;
            const url = THREE_DOCS[className];
            return { content: [{ type: "text", text: url ? `Docs for ${className}: ${url}` : `No direct link for ${className}.` }] };
        }
        case "generate_mesh_code": {
            const type = args?.type;
            const vName = args?.name || "mesh";
            let code = "";
            if (type === "box")
                code = `const geo = new THREE.BoxGeometry(1, 1, 1);\nconst mat = new THREE.MeshPhongMaterial({ color: 0x888888 });\nconst ${vName} = new THREE.Mesh(geo, mat);`;
            if (type === "cylinder")
                code = `const geo = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);\nconst mat = new THREE.MeshPhongMaterial({ color: 0x222222 });\nconst ${vName} = new THREE.Mesh(geo, mat);\n${vName}.rotation.x = -Math.PI / 2;`;
            return { content: [{ type: "text", text: code }] };
        }
        case "get_physics_constants": {
            return { content: [{ type: "text", text: "Gravity: 980, PlayerRadius: 4.0, MoveSpeed: 1000" }] };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MCP] Bridge Server listening on port ${WSS_PORT}`);
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map