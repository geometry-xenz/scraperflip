const chalk = require('chalk');

const LEVELS = {
  info: { color: chalk.cyan, stream: process.stdout },
  success: { color: chalk.green, stream: process.stdout },
  warn: { color: chalk.yellow, stream: process.stdout },
  error: { color: chalk.red, stream: process.stderr },
};

function emit(level, message) {
  const { color, stream } = LEVELS[level] ?? LEVELS.info;
  stream.write(`${color(message)}\n`);
}

const info = (message) => emit('info', message);
const success = (message) => emit('success', message);
const warn = (message) => emit('warn', message);
const error = (message) => emit('error', message);

module.exports = {
  info,
  success,
  warn,
  error,
};
