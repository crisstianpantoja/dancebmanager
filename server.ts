import express from 'express';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { handleDataRequest } from './db/api.js';
import { handleAuthRequest } from './db/authApi.js';
import { handleAttendanceRequest } from './db/attendance.js';
import { handlePagosRequest } from './db/pagos.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Bold Signature API
  app.post('/api/bold-signature', (req, res) => {
    try {
      const { amount, currency = 'COP', reference } = req.body;
      
      if (!amount || !reference) {
        return res.status(400).json({ error: 'Monto y referencia son requeridos' });
      }

      const secretKey = process.env.BOLD_SECRET_KEY || 'dummy_secret';
      
      // Standard signature generation for Bold:
      // concatenate: reference + amount + currency + secretKey
      // Then generate SHA256 hash.
      const stringToSign = `${reference}${amount}${currency}${secretKey}`;
      const hash = crypto.createHash('sha256').update(stringToSign).digest('hex');

      res.json({ hash, stringToSign: process.env.NODE_ENV !== 'production' ? stringToSign : undefined });
    } catch (e: any) {
      console.error('Error generating signature:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // App data / credentials APIs. In production on Netlify these same handlers
  // are served by netlify/functions/{data,auth}.ts; here they keep
  // `npm run dev` working with the exact same code path.
  const bridge = (handler: (request: Request) => Promise<Response>, label: string) =>
    async (req: express.Request, res: express.Response) => {
      try {
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // El token de sesión viaja en Authorization: sin reenviarlo, el
        // servidor de desarrollo trataría todo como anónimo.
        if (typeof req.headers.authorization === 'string') {
          headers.Authorization = req.headers.authorization;
        }
        const response = await handler(
          new Request(`http://localhost${req.originalUrl}`, {
            method: req.method,
            headers,
            body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
          })
        );
        res.status(response.status).type('application/json').send(await response.text());
      } catch (e: any) {
        console.error(`Error handling ${label}:`, e);
        res.status(500).json({ error: e?.message || 'Error desconocido' });
      }
    };

  app.all('/api/data', bridge(handleDataRequest, '/api/data'));
  app.all('/api/auth', bridge(handleAuthRequest, '/api/auth'));
  app.all('/api/asistencia', bridge(handleAttendanceRequest, '/api/asistencia'));
  app.all('/api/pagos', bridge(handlePagosRequest, '/api/pagos'));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
