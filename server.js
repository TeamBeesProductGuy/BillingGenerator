const env = require('./config/env');
const db = require('./config/database');

async function start() {
  await db.init();
  console.log('Supabase connection verified');

  const app = require('./app');
  const server = app.listen(env.port, () => {
    console.log(`Billing Engine running at http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
