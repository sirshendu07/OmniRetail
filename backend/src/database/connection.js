import mongoose from 'mongoose';
import { databaseConfig } from '../config/database.config.js';
import { logger } from '../common/utils/logger.js';

/**
 * Attaches event listeners to Mongoose connection for lifecycle observability.
 */
function registerConnectionEvents() {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB Atlas connection established successfully');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection encountered an error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost. Driver will attempt automatic reconnection');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB connection re-established');
  });
}

/**
 * Connects to MongoDB Atlas using connection pooling and retry defaults.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDatabase() {
  registerConnectionEvents();
  try {
    const conn = await mongoose.connect(databaseConfig.uri, databaseConfig.options);
    return conn;
  } catch (err) {
    logger.fatal({ err }, 'Fatal: Unable to connect to MongoDB Atlas');
    throw err;
  }
}

/**
 * Disconnects from MongoDB Atlas gracefully on shutdown.
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed gracefully');
  }
}

/**
 * Returns true if MongoDB connection state is open (1).
 * @returns {boolean}
 */
export function isDatabaseHealthy() {
  return mongoose.connection.readyState === 1;
}
