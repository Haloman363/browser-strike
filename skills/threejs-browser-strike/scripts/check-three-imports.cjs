const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));

let errors = 0;

files.forEach(file => {
    const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    
    // Check for "import * as THREE from 'three'"
    if (content.includes("from 'three'") || content.includes('from "three"')) {
        if (!content.includes("import * as THREE from 'three'") && !content.includes('import * as THREE from "three"')) {
            console.error(`❌ ${file}: Uses 'three' but doesn't use standard 'import * as THREE' pattern.`);
            errors++;
        }
    }

    // Check for deprecated patterns or specific project conventions
    if (content.includes('new THREE.Geometry()')) {
        console.error(`❌ ${file}: Uses deprecated THREE.Geometry(). Use BufferGeometry instead.`);
        errors++;
    }
});

if (errors === 0) {
    console.log("✅ Three.js imports and patterns look consistent across /src.");
} else {
    process.exit(1);
}
