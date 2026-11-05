/**
 * Declarations for Gemini Function Calling Tools in OmniRetail.
 */
export const RETAIL_TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'check_product_stock',
        description: 'Check available inventory stock for product at location',
        parameters: {
          type: 'OBJECT',
          properties: {
            productId: { type: 'STRING' },
            locationId: { type: 'STRING' }
          },
          required: ['productId', 'locationId']
        }
      },
      {
        name: 'find_nearest_store',
        description: 'Finds nearest stores to coordinates',
        parameters: {
          type: 'OBJECT',
          properties: {
            longitude: { type: 'NUMBER' },
            latitude: { type: 'NUMBER' }
          },
          required: ['longitude', 'latitude']
        }
      },
      {
        name: 'track_order',
        description: 'Tracks delivery and payment status of an order',
        parameters: {
          type: 'OBJECT',
          properties: { orderId: { type: 'STRING' } },
          required: ['orderId']
        }
      }
    ]
  }
];
