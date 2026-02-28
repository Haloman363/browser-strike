import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const server = new Server({
    name: "threejs-mcp",
    version: "1.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
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
            // --- General & Documentation ---
            {
                name: "get_docs",
                description: "Get documentation links for Three.js classes.",
                inputSchema: {
                    type: "object",
                    properties: {
                        className: { type: "string", description: "The name of the Three.js class." },
                    },
                    required: ["className"],
                },
            },
            // --- Modeling ---
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
                    properties: {
                        variableName: { type: "string", description: "The variable name of the mesh." },
                    },
                    required: ["variableName"],
                },
            },
            // --- Map Design ---
            {
                name: "generate_map_object",
                description: "Generate code for a map object (wall, crate, floor) with physics metadata.",
                inputSchema: {
                    type: "object",
                    properties: {
                        type: { type: "string", enum: ["wall", "crate", "floor"] },
                        dimensions: {
                            type: "object",
                            properties: {
                                w: { type: "number" },
                                h: { type: "number" },
                                d: { type: "number" }
                            }
                        },
                        position: {
                            type: "object",
                            properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                                z: { type: "number" }
                            }
                        }
                    },
                    required: ["type", "dimensions", "position"],
                },
            },
            // --- Gameplay & Physics ---
            {
                name: "get_physics_constants",
                description: "Retrieve standard project physics constants (Gravity, Speed, etc).",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "suggest_weapon_tweak",
                description: "Suggest changes to WEAPONS_DATA based on desired feel (e.g., 'make it faster', 'more recoil').",
                inputSchema: {
                    type: "object",
                    properties: {
                        weaponId: { type: "string" },
                        desiredChange: { type: "string" }
                    },
                    required: ["weaponId", "desiredChange"],
                },
            },
            // --- Testing ---
            {
                name: "generate_unit_test",
                description: "Generate a Vitest unit test for a Three.js utility or physics function.",
                inputSchema: {
                    type: "object",
                    properties: {
                        functionName: { type: "string" },
                        filePath: { type: "string" }
                    },
                    required: ["functionName", "filePath"],
                },
            },
            // --- Rendering & Performance ---
            {
                name: "estimate_complexity",
                description: "Estimate vertex and face counts for common Three.js geometries.",
                inputSchema: {
                    type: "object",
                    properties: {
                        geometryType: { type: "string" },
                        parameters: { type: "object", additionalProperties: true }
                    },
                    required: ["geometryType"],
                },
            },
            {
                name: "generate_shader_boilerplate",
                description: "Generate a basic ShaderMaterial boilerplate with common uniforms.",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string" }
                    }
                }
            }
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
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
                code = `const geo = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);\nconst mat = new THREE.MeshPhongMaterial({ color: 0x222222 });\nconst ${vName} = new THREE.Mesh(geo, mat);\n${vName}.rotation.x = -Math.PI / 2; // Project horizontal standard`;
            return { content: [{ type: "text", text: code }] };
        }
        case "calculate_bounding_box": {
            const vName = args?.variableName;
            const code = `${vName}.geometry.computeBoundingBox();\n${vName}.userData.boundingBox = ${vName}.geometry.boundingBox.clone();\n${vName}.userData.boundingBox.applyMatrix4(${vName}.matrixWorld);\n${vName}.userData.isSolid = true;`;
            return { content: [{ type: "text", text: code }] };
        }
        case "generate_map_object": {
            const { type, dimensions: d, position: p } = args;
            const textureMethod = type === "wall" ? "createWallTexture" : type === "crate" ? "createCrateTexture" : "createConcreteTexture";
            const code = `const ${type}Geo = new THREE.BoxGeometry(${d.w}, ${d.h}, ${d.d});\nconst ${type}Mat = new THREE.MeshPhongMaterial({ map: TextureGenerator.${textureMethod}() });\nconst ${type} = new THREE.Mesh(${type}Geo, ${type}Mat);\n${type}.position.set(${p.x}, ${p.y}, ${p.z});\n${type}.geometry.computeBoundingBox();\n${type}.userData.isSolid = true;\n${type}.userData.boundingBox = ${type}.geometry.boundingBox.clone().applyMatrix4(${type}.matrixWorld);`;
            return { content: [{ type: "text", text: code }] };
        }
        case "get_physics_constants": {
            return { content: [{ type: "text", text: "Physics Constants:\n- Gravity: 980\n- Standing Height: 18\n- Crouch Height: 10\n- Player Radius: 4.0\n- Move Speed: 1000\n- Jump Force: 250" }] };
        }
        case "suggest_weapon_tweak": {
            const { weaponId, desiredChange } = args;
            return { content: [{ type: "text", text: `Suggestion for ${weaponId} (${desiredChange}):\n- If too slow: Increase 'fireRate' (RPM).\n- If too shaky: Decrease 'recoil'.\n- If too accurate: Increase 'spread'.` }] };
        }
        case "generate_unit_test": {
            const { functionName, filePath } = args;
            const code = `import { describe, it, expect } from 'vitest';\nimport { ${functionName} } from '${filePath}';\n\ndescribe('${functionName}', () => {\n  it('should behave correctly', () => {\n    // TODO: Implement test logic\n  });\n});`;
            return { content: [{ type: "text", text: code }] };
        }
        case "estimate_complexity": {
            const { geometryType, parameters: p } = args;
            let verts = 0;
            if (geometryType === "BoxGeometry")
                verts = 24;
            if (geometryType === "SphereGeometry")
                verts = ((p.widthSegments || 32) + 1) * ((p.heightSegments || 16) + 1);
            return { content: [{ type: "text", text: `Estimated Vertex Count for ${geometryType}: ~${verts}` }] };
        }
        case "generate_shader_boilerplate": {
            const sName = args?.name || "customShader";
            const code = `const ${sName} = new THREE.ShaderMaterial({\n  uniforms: {\n    uTime: { value: 0 },\n    uResolution: { value: new THREE.Vector2() }\n  },\n  vertexShader: \`void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,\n  fragmentShader: \`uniform float uTime; void main() { gl_FragColor = vec4(abs(sin(uTime)), 0.0, 0.0, 1.0); }\`\n});`;
            return { content: [{ type: "text", text: code }] };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map