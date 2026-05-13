// ============================================================
// ALPHALEARN Production Cluster
// Spawns one worker per CPU core for maximum throughput.
// Each worker runs an independent Express + Next.js server
// sharing the PostgreSQL connection pool.
// Usage: NODE_ENV=production node cluster.js
// ============================================================

const cluster = require('cluster');
const os = require('os');

const numCPUs = Math.min(os.cpus().length, parseInt(process.env.CLUSTER_WORKERS || '0', 10) || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`🚀 ALPHALEARN Cluster — Primary ${process.pid} starting ${numCPUs} workers...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️  Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} online`);
  });
} else {
  // Each worker runs the full server
  require('./server.js');
}
