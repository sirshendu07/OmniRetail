import { env } from './env.config.js';

export const qdrantConfig = Object.freeze({
  url: env.QDRANT_URL?.replace(/\/$/, '') || 'http://localhost:6333',
  apiKey: env.QDRANT_API_KEY || null,
  collectionName: 'products_v1',
  vectorSize: 768
});
