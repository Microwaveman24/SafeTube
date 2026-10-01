'use strict';
/**
 * Tamper watchdog. The child's extension sends a heartbeat every few minutes.
 * This service runs on an interval, finds devices that went quiet longer
 * than TAMPER_ALERT_AFTER_MINUTES, and emails the parent(s).
 *
 * Cooldown: a device is not re-alerted within ALERT_COOLDOWN_HOURS.
 * When a quiet device starts heartbeating again, the alert state resets and
 * (optionally) a "back online" email is sent.
 *
 * A quiet device is usually just a powered-off computer — the email copy
 * says so plainly instead of crying wolf.
 */

const devices = require('../db/devices');
const parents = require('../db/parents');
const mailer = require('./mailer');
const logger = require('../logger');
const { config } = require('../config');

function resolveRecipients() {
  if (config.alertEmail) return [config.alertEmail];
  const emails = parents.allEmails();
  return emails;
}

async function checkOnce() {
  const staleBefore = new Date(Date.now() - config.tamperAlertAfterMinutes * 60 * 1000);
  const cooldownBefore = new Date(Date.now() - config.alertCooldownHours * 60 * 60 * 1000);
  const stale = devices.staleDevices(staleBefore, cooldownBefore);
  if (!stale.length) return { alerted: 0 };

  const recipients = resolveRecipients();
  if (!recipients.length) {
    logger.warn('[monitor] Devices went quiet but no parent email is known — skipping alerts.');
    return { alerted: 0, reason: 'no-recipients' };
  }

  let alerted = 0;
  for (const device of stale) {
    for (const to of recipients) {
      try {
        await mailer.sendMail(mailer.tamperAlertEmail(device, to));
      } catch (err) {
        logger.error(`[monitor] Failed to email ${to} about ${device.deviceId}:`, err.message);
      }
    }
    devices.markAlerted(device.deviceId);
    alerted += 1;
    logger.warn(
      `[monitor] Alert raised for device ${device.deviceId} (${device.childName || 'unnamed'}), ` +
        `quiet since ${device.lastSeenAt}`
    );
  }
  return { alerted };
}

/** Called when a heartbeat arrives from a device that was previously alerted. */
async function handleDeviceBack(device) {
  const recipients = resolveRecipients();
  for (const to of recipients) {
    try {
      await mailer.sendMail(mailer.deviceBackEmail(device, to));
    } catch (err) {
      logger.error(`[monitor] Failed to send back-online email to ${to}:`, err.message);
    }
  }
  logger.info(`[monitor] Device ${device.deviceId} is checking in again — alert state cleared.`);
}

let timer = null;

function start() {
  if (timer) return;
  logger.info(
    `[monitor] Watchdog started: alert after ${config.tamperAlertAfterMinutes} min quiet, ` +
      `cooldown ${config.alertCooldownHours}h, interval ${config.monitorIntervalMinutes} min. ` +
      `Email ${mailer.configured() ? 'configured' : 'NOT configured (alerts will only log)'}`
  );
  // Run once shortly after boot so a restart doesn't wait a full interval.
  setTimeout(() => checkOnce().catch((e) => logger.error('[monitor] check failed:', e.message)), 30 * 1000);
  timer = setInterval(
    () => checkOnce().catch((e) => logger.error('[monitor] check failed:', e.message)),
    config.monitorIntervalMinutes * 60 * 1000
  );
  // Don't keep the process alive just for the watchdog.
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, checkOnce, handleDeviceBack };
