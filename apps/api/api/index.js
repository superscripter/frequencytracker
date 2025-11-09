// Vercel serverless function that loads the bundled Fastify app
// Note: dist/index.js must be built before deployment

let handler;

module.exports = async (req, res) => {
  if (!handler) {
    // Dynamically import the built handler
    const distModule = await import('../dist/index.js');
    handler = distModule.default;
  }

  return handler(req, res);
};
