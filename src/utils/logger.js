import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

class Logger {
  constructor() {
    this.logDir = 'logs';
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFilename() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `universe-bulk-${date}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${logData}\n`;
  }

  writeToFile(formattedMessage) {
    fs.appendFileSync(this.getLogFilename(), formattedMessage);
  }

  info(message, data = null) {
    const formatted = this.formatMessage('info', message, data);
    console.log(chalk.blue(formatted.trim()));
    this.writeToFile(formatted);
  }

  success(message, data = null) {
    const formatted = this.formatMessage('success', message, data);
    console.log(chalk.green(formatted.trim()));
    this.writeToFile(formatted);
  }

  warn(message, data = null) {
    const formatted = this.formatMessage('warn', message, data);
    console.log(chalk.yellow(formatted.trim()));
    this.writeToFile(formatted);
  }

  error(message, data = null) {
    const formatted = this.formatMessage('error', message, data);
    console.log(chalk.red(formatted.trim()));
    this.writeToFile(formatted);
  }
}

export const logger = new Logger();