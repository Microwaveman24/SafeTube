'use strict';
/**
 * Rate limiting. Auth endpoints get a strict bucket (brute-force protection);
 * the general API gets a generous one so normal polling never trips it.
 */

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many attempts, try again later' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, try again later' },
});

module.exports = { authLimiter, apiLimiter };
