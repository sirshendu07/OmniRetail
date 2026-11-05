import { geminiService } from '../../infrastructure/ai/gemini.service.js';
import { qdrantService } from '../../infrastructure/qdrant/qdrant.service.js';
import { productRepository } from '../catalog/product.repository.js';
import { sendSuccess } from '../../common/utils/responseHandler.js';

export class AiController {
  async chat(req, res) {
    const reply = await geminiService.chatWithAssistant({
      message: req.body.message,
      userContext: req.user
    });
    return sendSuccess(res, 'AI Assistant response generated', { reply });
  }

  async semanticSearch(req, res) {
    const { query, limit = 5 } = req.body;
    const queryVector = await geminiService.generateEmbedding(query);
    const matches = await qdrantService.searchSimilar(queryVector, Number(limit));

    const productIds = matches.map((m) => m.payload?.productId || m.id);
    const products = await Promise.all(
      productIds.map((id) => productRepository.findById(id).catch(() => null))
    );

    return sendSuccess(res, 'Semantic search results retrieved', {
      query,
      results: products.filter(Boolean),
      vectorMatchesCount: matches.length
    });
  }

  async indexProduct(req, res) {
    const { productId } = req.params;
    const product = await productRepository.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const text = `${product.name} ${product.brand} ${product.description}`;
    const vector = await geminiService.generateEmbedding(text);
    await qdrantService.upsertProduct(product._id, vector, {
      name: product.name,
      sku: product.sku,
      brand: product.brand,
      price: product.regularPrice
    });

    return sendSuccess(res, 'Product indexed for vector similarity search', { productId });
  }
}

export const aiController = new AiController();
