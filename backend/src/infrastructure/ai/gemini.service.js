import { geminiConfig } from '../../config/gemini.config.js';
import { RETAIL_TOOL_DECLARATIONS } from './retailTools.js';
import { inventoryService } from '../../modules/inventory/inventory.service.js';
import { locationRepository } from '../../modules/locations/location.repository.js';
import { orderRepository } from '../../modules/orders/order.repository.js';
import { logger } from '../../common/utils/logger.js';

export class GeminiService {
  /**
   * Generates a 768-dimension text embedding for semantic search.
   */
  async generateEmbedding(text) {
    if (process.env.NODE_ENV === 'test' || !geminiConfig.apiKey) {
      return Array.from({ length: 768 }, (_, i) => Math.sin(i + text.length));
    }
    const url = `${geminiConfig.apiBaseUrl}/models/${geminiConfig.embeddingModel}:embedContent?key=${geminiConfig.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } })
    });
    const data = await res.json();
    return data.embedding?.values || Array.from({ length: 768 }, () => 0);
  }

  /**
   * Dispatches and executes model tool calls against backend domain services.
   */
  async executeTool(name, args) {
    try {
      if (name === 'check_product_stock') {
        const stock = await inventoryService.getStock(args.productId, args.locationId);
        return { availableStock: stock.availableStock, onHandStock: stock.onHandStock };
      }
      if (name === 'find_nearest_store') {
        const stores = await locationRepository.findNearestLocations(args.longitude, args.latitude, 50000, 3);
        return { stores: stores.map((s) => ({ code: s.code, name: s.name, city: s.address.city })) };
      }
      if (name === 'track_order') {
        const order = await orderRepository.findByOrderId(args.orderId);
        return order ? { status: order.status, grandTotal: order.pricing.grandTotal } : { error: 'Order not found' };
      }
      return { error: 'Unknown tool' };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Handles user chat conversation with Gemini model and automated tool execution.
   */
  async chatWithAssistant({ message, userContext = {} }) {
    if (process.env.NODE_ENV === 'test' || !geminiConfig.apiKey) {
      return this.handleMockAssistantResponse(message);
    }
    const url = `${geminiConfig.apiBaseUrl}/models/${geminiConfig.model}:generateContent?key=${geminiConfig.apiKey}`;
    const requestBody = {
      systemInstruction: {
        parts: [{ text: 'You are the intelligent OmniRetail store assistant. Use tools when looking up real data.' }]
      },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      tools: RETAIL_TOOL_DECLARATIONS
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const result = await res.json();
    return this.resolveGeminiResponse(result, url, requestBody);
  }

  /**
   * Resolves text response or executes functionCall loop.
   */
  async resolveGeminiResponse(result, url, originalBody) {
    const candidate = result.candidates?.[0]?.content?.parts?.[0];
    if (candidate?.functionCall) {
      const toolCall = candidate.functionCall;
      const toolResult = await this.executeTool(toolCall.name, toolCall.args);

      const followUpBody = {
        ...originalBody,
        contents: [
          ...originalBody.contents,
          { role: 'model', parts: [{ functionCall: toolCall }] },
          {
            role: 'function',
            parts: [{ functionResponse: { name: toolCall.name, response: toolResult } }]
          }
        ]
      };

      const finalRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpBody)
      });
      const finalData = await finalRes.json();
      return finalData.candidates?.[0]?.content?.parts?.[0]?.text || 'Action completed';
    }

    return candidate?.text || 'How can I assist you with OmniRetail today?';
  }

  /**
   * Fallback mock assistant for test environments.
   */
  handleMockAssistantResponse(message) {
    if (message.toLowerCase().includes('order')) {
      return 'I found your order! It is currently CONFIRMED and being prepared for fulfillment.';
    }
    if (message.toLowerCase().includes('stock')) {
      return 'The product is in stock and available for pickup or home delivery.';
    }
    return 'Welcome to OmniRetail! I can help you search products, check local store inventory, or track orders.';
  }
}

export const geminiService = new GeminiService();
