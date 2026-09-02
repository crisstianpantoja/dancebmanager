import type { Config } from '@netlify/functions';
import { handleClasesRequest } from '../../db/clases.js';

export default async (request: Request) => handleClasesRequest(request);

export const config: Config = {
  path: '/api/clases',
};
