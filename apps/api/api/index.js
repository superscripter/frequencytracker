// Dynamically import and re-export the pre-built serverless handler
export default async function handler(req, res) {
  const { default: distHandler } = await import('../dist/index.js');
  return distHandler(req, res);
}
