import type { Config } from '@netlify/functions';
import { handleDataRequest } from '../../db/api.js';

export default async (request: Request) => handleDataRequest(request);

export const config: Config = {
  path: '/api/data',
};
