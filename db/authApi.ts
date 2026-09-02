import {
  AuthError,
  changeOwnPassword,
  createUsers,
  dismissPasswordResetRequest,
  ensurePasswordsHashed,
  listPasswordResetRequests,
  login,
  requestPasswordReset,
  requireAdmin,
  requireSession,
  resetPassword,
  resolvePasswordResetRequest,
  type NewUserInput,
} from './auth.js';
import type { AnyRecord } from './mapping.js';

/**
 * Endpoint de credenciales (`/api/auth`).
 *
 * Cada acción es explícita y comprueba por sí misma quién la puede ejecutar.
 * Las respuestas nunca incluyen hashes; las contraseñas temporales viajan una
 * única vez, en la respuesta de la acción que las genera.
 */
export async function handleAuthRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método no permitido' }, { status: 405 });
    }

    const body = (await request.json().catch(() => null)) as AnyRecord | null;
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const action = String(body.action ?? '');

    switch (action) {
      case 'login':
        return Response.json(await login(body));

      case 'session': {
        // Revalida un token guardado en el navegador tras recargar la página.
        const claims = await requireSession(request);
        return Response.json({ ok: true, user: { id: claims.sub, rol: claims.rol, scope: claims.scope } });
      }

      case 'change-password': {
        const claims = await requireSession(request);
        return Response.json(await changeOwnPassword(claims, body));
      }

      case 'reset-password': {
        await requireAdmin(request);
        return Response.json(await resetPassword(body));
      }

      // Petición pública: se hace desde el inicio de sesión, sin sesión. No
      // cambia ninguna credencial, sólo deja la solicitud para el administrador.
      case 'request-reset':
        return Response.json(await requestPasswordReset(body));

      case 'list-reset-requests': {
        await requireAdmin(request);
        return Response.json({ requests: await listPasswordResetRequests() });
      }

      case 'resolve-reset-request': {
        const claims = await requireAdmin(request);
        return Response.json(await resolvePasswordResetRequest(claims, body));
      }

      case 'dismiss-reset-request': {
        const claims = await requireAdmin(request);
        return Response.json(await dismissPasswordResetRequest(claims, body));
      }

      case 'create-users': {
        await requireAdmin(request);
        await ensurePasswordsHashed();
        const users = Array.isArray(body.users) ? (body.users as NewUserInput[]) : [];
        return Response.json({ created: await createUsers(users) });
      }

      default:
        return Response.json({ error: `Acción no reconocida: ${action}` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/auth]', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}
