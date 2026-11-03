import { handleVercelRequest } from '../server/vercelHandler.js';

export default async function handler(req: any, res: any) {
  if (req.url === '/api' || req.url === '/api/') {
    req.url = '/api/setup';
  }
  return handleVercelRequest(req, res);
}
