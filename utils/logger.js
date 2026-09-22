const chalk = require('chalk');

function info(message) {
  console.log(chalk.cyan(message));
}

function success(message) {
  console.log(chalk.green(message));
}

function warn(message) {
  console.log(chalk.yellow(message));
}

function error(message) {
  console.log(chalk.red(message));
}

module.exports = {
  info,
  success,
  warn,
  error,
};
