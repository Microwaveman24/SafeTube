'use strict';
/**
 * Express app assembly. Mounts middleware and route modules, serves the
 * dashboard, and centralizes error handling.
 */

const express = require('express');
const path = require('path');

const { attachParent } = require('./middleware/auth');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const logger = require('./logger');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const requestRoutes = require('./routes/requests');
const whitelistRoutes = require('./routes/whitelist');
const channelRoutes = require('./routes/channels');
const childrenRoutes = require('./routes/children');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Permissive CORS for /api so the extension (chrome-extension:// origin)
  // can call the API without host-permission quirks.
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Family-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/api', apiLimiter);
  app.use(attachParent);

  app.use('/api/auth', authRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/whitelist', whitelistRoutes);
  app.use('/api/channel-whitelist', channelRoutes);
  app.use('/api/children', childrenRoutes);

  // --- dashboard gating ---
  // setup.html is always reachable (it no-ops when setup is complete).
  // login.html/js are reachable so logged-out parents can sign in.
  // Everything else requires a parent session.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const open = ['/setup.html', '/setup.js', '/login.html', '/login.js', '/styles.css'];
    if (open.includes(req.path)) return next();
    if (req.parent) return next();
    if (req.path === '/' || req.path === '/index.html') {
      return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    }
    return res.status(401).json({ error: 'parent login required' });
  });

  app.use(express.static(PUBLIC_DIR));

  // --- centralized error handler ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (status === 500) logger.error('[app] Unhandled error:', err);
    res.status(status).json({ error: status === 500 ? 'internal server error' : err.message });
  });

  return app;
}

module.exports = { createApp, PUBLIC_DIR };
