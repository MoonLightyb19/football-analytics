import winston from 'winston';

const isProd = process.env.NODE_ENV === 'production';

// Production (Railway etc.): JSON lines to stdout — the host collects them, no log files on disk.
// Development: readable colour output to the console plus error.log / combined.log next to the code.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bet-to-beat-api' },
  transports: isProd
    ? [new winston.transports.Console()]
    : [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
      ]
});

export default logger;
