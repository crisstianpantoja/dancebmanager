import type { Config } from '@netlify/functions';
import { handleAttendanceRequest } from '../../db/attendance.js';

export default async (request: Request) => handleAttendanceRequest(request);

export const config: Config = {
  path: '/api/asistencia',
};
