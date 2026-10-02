'use strict';
/**
 * Child profile management (parent dashboard).
 *
 * - GET    /api/children        → { children: [{id, name, createdAt, deviceCount, totalRequests, pendingRequests, videoCount, channelCount}] }
 * - POST   /api/children        {name} → 201 { child }
 * - PATCH  /api/children/:id    {name} → { child }  (404 when missing / not owned)
 * - DELETE /api/children/:id              → { ok: true }
 *
 * All routes require a parent session. Deleting a child cascades to its
 * devices, requests, and whitelists.
 */

const express = require('express');
const children = require('../db/children');
const { requireParent } = require('../middleware/auth');
const { reqString } = require('../middleware/validate');

const router = express.Router();

function ownedOr404(req, rawId) {
  const child = children.get(rawId);
  if (!child || child.parentId !== req.parent.id) {
    return null;
  }
  return child;
}

router.get('/', requireParent, (req, res) => {
  res.json({ children: children.list(req.parent.id) });
});

router.post('/', requireParent, (req, res, next) => {
  try {
    const name = reqString(req.body && req.body.name, 'name', { max: 100 });
    const child = children.create(req.parent.id, name);
    res.status(201).json({ child });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireParent, (req, res, next) => {
  try {
    const existing = ownedOr404(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'child not found' });
    const name = reqString(req.body && req.body.name, 'name', { max: 100 });
    const child = children.rename(existing.id, name);
    res.json({ child });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireParent, (req, res) => {
  const existing = ownedOr404(req, req.params.id);
  if (!existing) return res.status(404).json({ error: 'child not found' });
  children.remove(existing.id);
  res.json({ ok: true });
});

module.exports = router;
