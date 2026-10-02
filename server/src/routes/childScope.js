'use strict';
/**
 * Shared child-scoping helpers for routes. Not an Express router — just
 * functions used by the whitelist/channel/request/device routes.
 */

const children = require('../db/children');
const parents = require('../db/parents');
const { bad } = require('../middleware/validate');

function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

/** The parent id acting for this request: session parent, else the single parent. */
function callerParentId(req) {
  const id = req.parent ? req.parent.id : parents.firstId();
  if (!id) throw bad('parent setup required');
  return id;
}

/**
 * Resolve the child a *read* request targets.
 * - `?childId=` → must exist and belong to the caller's parent (404 otherwise).
 * - `?childName=` (extension / family-key callers) → resolveOrCreate.
 * - neither: parent sessions get 400; family-key callers resolve '(unnamed)'.
 */
function resolveChild(req) {
  const parentId = callerParentId(req);
  const qChildId = req.query.childId;
  if (qChildId !== undefined && qChildId !== null && qChildId !== '') {
    const child = children.get(qChildId);
    if (!child || child.parentId !== parentId) throw notFound('child not found');
    return child;
  }
  if (req.parent) throw bad('childId is required');
  return children.resolveOrCreate(parentId, req.query.childName || '');
}

/**
 * Resolve the child a parent-session *mutation* targets. 404 when the child
 * is missing or belongs to a different parent. (Call on requireParent routes.)
 */
function ownChild(req, rawId) {
  if (rawId === undefined || rawId === null || rawId === '') {
    throw bad('childId is required');
  }
  const child = children.get(rawId);
  if (!child || !req.parent || child.parentId !== req.parent.id) {
    throw notFound('child not found');
  }
  return child;
}

module.exports = { resolveChild, ownChild, callerParentId };
