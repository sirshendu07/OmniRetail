import { env } from './env.config.js';

/**
 * MongoDB Mongoose Connection Configuration
 * Configures connection pooling, socket timeouts, and retry logic.
 */
export const databaseConfig = Object.freeze({
  uri: env.MONGODB_URI,
  options: {
    maxPoolSize: 50,
    minPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
    autoIndex: env.NODE_ENV !== 'production'
  }
});
