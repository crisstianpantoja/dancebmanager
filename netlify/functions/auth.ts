import type { Config } from '@netlify/functions';
import { handleAuthRequest } from '../../db/authApi.js';

export default async (request: Request) => handleAuthRequest(request);

export const config: Config = {
  path: '/api/auth',
};
