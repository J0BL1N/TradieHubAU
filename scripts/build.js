
/**
 * TradieHub Build Script
 * Usage: node scripts/build.js
 * 
 * Creates 'tradiehub-deploy.zip' ignoring development files.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const ZIP_NAME = 'tradiehub-deploy.zip';
const OUTPUT_PATH = path.join(ROOT_DIR, ZIP_NAME);

// Items to EXCLUDE from the production build
const EXCLUDES = [
    'node_modules',
    'supabase',     // Backend code (deployed via CLI, not file upload)
    'scripts',      // Build scripts
    '.git',
    '.gemini',
    '.vscode',
    '.gitignore',
    'package.json',
    'package-lock.json',
    'README.md',
    ZIP_NAME,
    'fix-path-links.js'
];

console.log(`📦 Building ${ZIP_NAME} from ${ROOT_DIR}...`);

try {
    // get list of files in root
    const items = fs.readdirSync(ROOT_DIR);
    
    // filter out excludes
    const toZip = items.filter(item => !EXCLUDES.includes(item));
    
    // Construct the PowerShell command (running from ROOT_DIR)
    // We pass the list of files/folders to compress
    const args = toZip.map(i => `'${i}'`).join(',');
    
    const command = `powershell Compress-Archive -Path ${args} -DestinationPath '${OUTPUT_PATH}' -Force`;
    
    console.log(`> Executing compression...`);
    execSync(command, { cwd: ROOT_DIR, stdio: 'inherit' });
    
    console.log(`\n✅ Build Complete: ${OUTPUT_PATH}`);
    console.log(`\n👉 To deploy:`);
    console.log(`   1. Go to Hostinger File Manager -> public_html`);
    console.log(`   2. Delete old files (optional, or overwrite)`);
    console.log(`   3. Upload '${ZIP_NAME}'`);
    console.log(`   4. Right-click -> Extract`);
    
} catch (error) {
    console.error('❌ Build failed:', error.message);
}
