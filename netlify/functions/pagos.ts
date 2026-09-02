import type { Config } from '@netlify/functions';
import { handlePagosRequest } from '../../db/pagos.js';

export default async (request: Request) => handlePagosRequest(request);

export const config: Config = {
  path: '/api/pagos',
};
