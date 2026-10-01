'use strict';
/**
 * SafeTube parent server — entry point.
 *
 * - Serves the parent dashboard and the extension API.
 * - Watches child-device heartbeats; emails the parent if a device goes
 *   quiet (possible extension tampering).
 *
 * Run:  FAMILY_KEY=<secret> node server.js
 * See .env.example for all configuration.
 */

const { config, validate } = require('./src/config');
const logger = require('./src/logger');

// Fail fast on bad configuration.
validate(config);
if (!config.smtp.host) {
  logger.warn('[boot] SMTP_HOST not set — tamper alert emails are disabled (alerts will only log).');
}

// Requiring the db module opens the connection and runs migrations.
require('./src/db/index');
const parents = require('./src/db/parents');
const { createApp } = require('./src/app');
const monitor = require('./src/services/monitor');

if (parents.setupRequired()) {
  logger.warn('[boot] No parent account exists yet — open the dashboard to create one (one-time setup).');
}

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`[boot] Server running at http://localhost:${config.port}`);
  logger.info(`[boot] Dashboard: http://localhost:${config.port}/   (API at /api/...)`);
});

monitor.start();

function shutdown(signal) {
  logger.info(`[boot] Received ${signal} — shutting down.`);
  monitor.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
