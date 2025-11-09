import { buildServer } from '../src/index.js';

let serverInstance: any = null;

export default async function handler(req: any, res: any) {
  if (!serverInstance) {
    serverInstance = await buildServer();
    await serverInstance.ready();
  }

  // Vercel serverless function handler
  serverInstance.server.emit('request', req, res);
}
