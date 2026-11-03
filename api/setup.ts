import { handleVercelRequest } from '../server/vercelHandler.js';

export default async function handler(req: any, res: any) {
  return handleVercelRequest(req, res);
}
