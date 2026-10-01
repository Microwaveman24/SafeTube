'use strict';
/**
 * Tiny structured logger. Keeps logs greppable and timestamped without
 * pulling in a dependency. Levels: debug < info < warn < error.
 * Set LOG_LEVEL=debug for verbose output.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] < current) return;
  const ts = new Date().toISOString();
  const tag = `[safetube:${level}]`;
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](ts, tag, ...args);
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};
