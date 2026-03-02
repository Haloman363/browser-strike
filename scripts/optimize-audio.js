/**
 * optimize-audio.js
 * AI Tool for automated audio compression and web optimization.
 * Uses ffmpeg-static to convert WAV/MP3 to game-ready OGG/MP3 presets.
 */

import ffmpeg from 'ffmpeg-static';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const ARGS = process.argv.slice(2);
const INPUT = ARGS[0];
const TYPE = ARGS[1] || 'sfx'; // 'sfx', 'bgm', 'ui'

if (!INPUT) {
    console.error("Usage: node scripts/optimize-audio.js <input_file> [type]");
    process.exit(1);
}

const OUTPUT_DIR = './assets/audio/optimized/';
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ext = path.extname(INPUT);
const base = path.basename(INPUT, ext);
const output = path.join(OUTPUT_DIR, `${base}.ogg`);

// PRESETS
const PRESETS = {
    sfx: "-ac 1 -ar 22050 -b:a 64k", // Mono, lower sample rate for small FX
    bgm: "-ac 2 -ar 44100 -b:a 128k", // Stereo, full quality
    ui: "-ac 1 -ar 44100 -b:a 96k"   // Mono, clear UI clicks
};

const cmd = `"${ffmpeg}" -i "${INPUT}" -y ${PRESETS[TYPE] || PRESETS.sfx} "${output}"`;

console.log(`[AudioTweaker] Optimizing ${base} as ${TYPE.toUpperCase()}...`);
try {
    execSync(cmd);
    console.log(`[AudioTweaker] Success! Saved to: ${output}`);
} catch (err) {
    console.error(`[AudioTweaker] Failed to process audio:`, err.message);
}
