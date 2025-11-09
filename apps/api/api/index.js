// Vercel serverless function that loads the bundled Fastify app
// Note: dist/index.js must be built before deployment

let handlerInstance;

export default async function handler(req, res) {
  if (!handlerInstance) {
    // Dynamically import the built handler
    const distModule = await import('../dist/index.js');
    handlerInstance = distModule.default;
  }

  return handlerInstance(req, res);
}
