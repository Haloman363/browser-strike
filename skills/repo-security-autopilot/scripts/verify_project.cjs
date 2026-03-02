const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
    console.log(`Running: ${cmd}`);
    try {
        const output = execSync(cmd, { stdio: 'pipe' }).toString();
        return { success: true, output };
    } catch (err) {
        return { success: false, output: err.stdout ? err.stdout.toString() : err.message };
    }
}

async function verify() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const results = [];

    // 1. Audit
    console.log("--- Phase 1: Security Audit ---");
    let audit = run('npm audit');
    if (!audit.success) {
        console.log("Audit found issues. Attempting fix...");
        run('npm audit fix');
        audit = run('npm audit');
    }
    results.push({ name: 'Security Audit', ...audit });

    // 2. Build
    if (pkg.scripts && pkg.scripts.build) {
        console.log("--- Phase 2: Build ---");
        results.push({ name: 'Build', ...run('npm run build') });
    }

    // 3. Test
    if (pkg.scripts && pkg.scripts.test) {
        console.log("--- Phase 3: Test ---");
        results.push({ name: 'Test', ...run('npm test') });
    }

    // Summary
    console.log("
--- VERIFICATION SUMMARY ---");
    results.forEach(r => {
        console.log(`${r.name}: ${r.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    });

    const anyFailed = results.some(r => !r.success);
    process.exit(anyFailed ? 1 : 0);
}

verify();
