import { handleApiRoute, ApiRequest } from './apiRouter.js';

export async function handleVercelRequest(req: any, res: any) {
  const apiReq: ApiRequest = {
    method: req.method || 'GET',
    url: req.url || '/',
    query: (req.query as Record<string, string>) || {},
    body: req.body,
    headers: (req.headers as Record<string, string | undefined>) || {},
  };

  const response = await handleApiRoute(apiReq);

  if (response.headers) {
    for (const [k, v] of Object.entries(response.headers)) {
      res.setHeader(k, v);
    }
  }

  res.statusCode = response.statusCode;

  if (Buffer.isBuffer(response.body)) {
    res.end(response.body);
  } else if (typeof response.body === 'object') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response.body));
  } else {
    res.end(String(response.body ?? ''));
  }
}
