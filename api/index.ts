/**
 * Direct Vercel Edge/Serverless Proxy to Persistent Cloud Run Backend & Cloud SQL
 * 
 * Routes all API calls directly to the live persistent Cloud Run instance hosting
 * the Baileys WhatsApp WebSocket socket and Cloud SQL PostgreSQL connection.
 */

const DEFAULT_DIRECT_BACKEND = 'https://ais-dev-hsblii7uqrvcik2nynq2rw-44864405563.europe-west2.run.app';

export default async function handler(req: any, res: any) {
  // Global CORS headers for direct browser fetch calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const targetBackend = (
    process.env.BACKEND_URL ||
    process.env.VITE_BACKEND_URL ||
    DEFAULT_DIRECT_BACKEND
  ).replace(/\/+$/, '');

  try {
    const targetUrl = `${targetBackend}${req.url}`;
    
    const forwardHeaders: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
    };
    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'];
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const proxyRes = await fetch(targetUrl, fetchOptions);
    res.statusCode = proxyRes.status;
    
    const contentType = proxyRes.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    
    const data = await proxyRes.text();
    res.end(data);
  } catch (err: any) {
    console.error('[Direct Proxy Error]', err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: `Direct backend connection error: ${err.message || 'Failed to reach persistent Cloud Run backend'}`,
      }));
    }
  }
}
