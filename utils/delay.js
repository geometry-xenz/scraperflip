const { error } = require('./logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asInt(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`delay: ${name} must be a non-negative integer, received ${value}`);
  }
  return n;
}

function getRandomInt(min, max) {
  const lo = asInt(min, 'min');
  const hi = asInt(max, 'max');
  if (lo > hi) {
    throw new Error(`delay: min (${lo}) must not exceed max (${hi})`);
  }
  // +1 makes the upper bound inclusive (Math.random() * (hi - lo + 1))
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

async function randomDelay(min, max) {
  let waitMs;
  try {
    waitMs = getRandomInt(min, max);
  } catch (err) {
    error(`delay: ${err.message}. Falling back to 0ms.`);
    waitMs = 0;
  }
  await sleep(waitMs);
}

const TRANSIENT_NET_ERRORS = new Set([
  'net::ERR_ABORTED',
  'net::ERR_INVALID_RESPONSE',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_TIMED_OUT',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_FAILED',
]);

function isTransientNetError(err) {
  if (!err) return false;
  const msg = err.message || String(err);
  return TRANSIENT_NET_ERRORS.has(msg) || /timeout|reset|aborted|connection (closed|refused)/i.test(msg);
}

module.exports = {
  sleep,
  getRandomInt,
  randomDelay,
  isTransientNetError,
};
