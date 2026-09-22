function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomDelay(min, max) {
  const waitMs = getRandomInt(min, max);
  await sleep(waitMs);
}

module.exports = {
  sleep,
  randomDelay,
};
