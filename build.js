const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('==> RubiXSense Build Starting...');

const frontendDir = path.join(__dirname, 'frontend');
const frontendDist = path.join(frontendDir, 'dist');
const rootDist = path.join(__dirname, 'dist');

// 1. Install frontend dependencies (including devDependencies so Vite is always available)
console.log('==> Installing frontend dependencies...');
execSync('npm install --include=dev', {
  cwd: frontendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
});

// 2. Build frontend using Vite
console.log('==> Building frontend with Vite...');
execSync('npx vite build', {
  cwd: frontendDir,
  stdio: 'inherit',
});

// 3. Ensure both ./dist and frontend/dist exist with identical build output
console.log('==> Synchronizing build output to ./dist ...');
if (fs.existsSync(rootDist)) {
  fs.rmSync(rootDist, { recursive: true, force: true });
}
fs.cpSync(frontendDist, rootDist, { recursive: true });

console.log('==> Build completed successfully! Production bundle ready in dist/ and frontend/dist/');
