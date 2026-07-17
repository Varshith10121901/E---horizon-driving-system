const { spawn } = require('child_process');
const path = require('path');

console.log('==================================================');
console.log('         DRIVESPHERE CONCURRENT LAUNCHER');
console.log('==================================================\n');

// 1. Start Node.js Server
console.log('[Launcher] Starting Node.js server (Port 3000)...');
const nodeProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe']
});

// 2. Start Flask Python Server
console.log('[Launcher] Starting Flask auth server (Port 5000)...');
const pythonProcess = spawn('python', ['app.py'], {
  cwd: path.join(__dirname, 'server'),
  env: { ...process.env, PORT: '5000' },
  stdio: ['inherit', 'pipe', 'pipe']
});

// Helper to prefix output
function prefixOutput(stream, prefix, colorCode) {
  let buffer = '';
  stream.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep the last partial line
    lines.forEach((line) => {
      if (line.trim() !== '') {
        console.log(`\x1b[${colorCode}m${prefix}\x1b[0m ${line}`);
      }
    });
  });
}

// Prefix logs: Node (36m = Cyan), Python (32m = Green)
prefixOutput(nodeProcess.stdout, '[Node]', '36');
prefixOutput(nodeProcess.stderr, '[Node ERR]', '31');
prefixOutput(pythonProcess.stdout, '[Flask]', '32');
prefixOutput(pythonProcess.stderr, '[Flask ERR]', '31');

// Handle process termination
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[Launcher] Shutting down all servers...');
  
  nodeProcess.kill('SIGTERM');
  pythonProcess.kill('SIGTERM');
  
  // Force kill after timeout
  setTimeout(() => {
    nodeProcess.kill('SIGKILL');
    pythonProcess.kill('SIGKILL');
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

nodeProcess.on('exit', (code) => {
  if (!isShuttingDown) {
    console.log(`[Launcher] Node process exited with code ${code}`);
    shutdown();
  }
});

pythonProcess.on('exit', (code) => {
  if (!isShuttingDown) {
    console.log(`[Launcher] Flask process exited with code ${code}`);
    shutdown();
  }
});
