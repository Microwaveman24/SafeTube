'use strict';
/**
 * Email service (nodemailer over SMTP). Used for tamper alerts.
 *
 * Configuration (env): SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
 * SMTP_PASS, SMTP_FROM. If SMTP_HOST is unset the service is disabled:
 * sendAlert() logs instead of throwing, so the rest of the app works fine
 * without email configured.
 *
 * Gmail tip: create an App Password (Google Account → Security → 2-Step
 * Verification → App passwords) and use it as SMTP_PASS with
 * SMTP_HOST=smtp.gmail.com, SMTP_PORT=587.
 */

const nodemailer = require('nodemailer');
const logger = require('../logger');
const { config } = require('../config');

let transporter = null;

function configured() {
  return Boolean(config.smtp.host);
}

function getTransporter() {
  if (!configured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user || config.smtp.pass
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    logger.warn(`[mailer] Email NOT sent (SMTP not configured) — to=${to} subject="${subject}"`);
    logger.warn(`[mailer] Body:\n${text}`);
    return { sent: false, reason: 'smtp-not-configured' };
  }
  const from = config.smtp.from || config.smtp.user;
  await t.sendMail({ from, to, subject, text, html });
  logger.info(`[mailer] Sent "${subject}" to ${to}`);
  return { sent: true };
}

function tamperAlertEmail(device, parentEmail) {
  const name = device.childName || 'your child';
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never';
  const subject = `SafeTube alert: ${name}'s device went quiet`;
  const text = [
    `Hi,`,
    ``,
    `SafeTube hasn't heard from ${name}'s device since ${lastSeen}.`,
    ``,
    `This usually means the computer is off or asleep — but it can also mean`,
    `the SafeTube extension was disabled or removed from Chrome.`,
    ``,
    `Device ID: ${device.deviceId}`,
    `Last check-in: ${lastSeen}`,
    ``,
    `If you didn't turn the computer off, check that the SafeTube extension`,
    `is still enabled on the child's browser (chrome://extensions).`,
    ``,
    `— SafeTube`,
  ].join('\n');
  return { to: parentEmail, subject, text };
}

function deviceBackEmail(device, parentEmail) {
  const name = device.childName || 'your child';
  const subject = `SafeTube: ${name}'s device is checking in again`;
  const text = [
    `Hi,`,
    ``,
    `Good news — ${name}'s device (ID ${device.deviceId}) is sending`,
    `heartbeats again, so the SafeTube extension appears to be active.`,
    ``,
    `— SafeTube`,
  ].join('\n');
  return { to: parentEmail, subject, text };
}

module.exports = { configured, sendMail, tamperAlertEmail, deviceBackEmail };
