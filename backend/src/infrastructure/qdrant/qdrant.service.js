import crypto from 'node:crypto';
import { qdrantConfig } from '../../config/qdrant.config.js';
import { logger } from '../../common/utils/logger.js';

export class QdrantService {
  /**
   * Builds headers with optional API Key for Qdrant Cloud.
   */
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (qdrantConfig.apiKey) headers['api-key'] = qdrantConfig.apiKey;
    return headers;
  }

  /**
   * Maps a 24-char MongoDB ObjectId to a deterministic UUID for Qdrant compatibility.
   */
  objectIdToUuid(idString) {
    const hex = idString.toString().replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Ensures the Qdrant product vector collection exists with Cosine metric.
   */
  async ensureCollection() {
    try {
      const url = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          vectors: { size: qdrantConfig.vectorSize, distance: 'Cosine' }
        })
      });
      if (res.ok || res.status === 409) {
        logger.info({ collection: qdrantConfig.collectionName }, 'Qdrant collection verified');
        return true;
      }
      return false;
    } catch (err) {
      logger.warn({ err: err.message }, 'Qdrant collection check skipped');
      return false;
    }
  }

  /**
   * Upserts product embedding into Qdrant vector index.
   */
  async upsertProduct(productId, vector, payload = {}) {
    const pointId = this.objectIdToUuid(productId);
    const url = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        points: [{ id: pointId, vector, payload: { ...payload, productId: productId.toString() } }]
      })
    });
    return res.ok;
  }

  /**
   * Queries top-k similar products using vector cosine search.
   */
  async searchSimilar(vector, limit = 5) {
    const url = `${qdrantConfig.url}/collections/${qdrantConfig.collectionName}/points/search`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ vector, limit, with_payload: true })
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
  }
}

export const qdrantService = new QdrantService();
