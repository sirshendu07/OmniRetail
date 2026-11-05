import { env } from './env.config.js';

export const geminiConfig = Object.freeze({
  apiKey: env.GEMINI_API_KEY || null,
  model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  embeddingModel: 'text-embedding-004',
  apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta'
});
