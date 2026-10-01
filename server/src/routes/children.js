'use strict';
/** Child request statistics (parent dashboard). */

const express = require('express');
const requests = require('../db/requests');
const { requireParent } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireParent, (_req, res) => {
  res.json({ children: requests.childStats() });
});

module.exports = router;
