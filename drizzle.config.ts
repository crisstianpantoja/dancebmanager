import type { Config } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit para generar las migraciones de la base.
 *
 * La importación es de sólo tipo a propósito: se borra al compilar, así que
 * este archivo no necesita resolver el paquete 'drizzle-kit' cuando se ejecuta.
 * `npx drizzle-kit generate` corre con su propia copia del paquete y lee esta
 * configuración desde la raíz del proyecto; si aquí se importara `defineConfig`
 * —que sólo devuelve el objeto tal cual—, la generación fallaría con «Cannot
 * find module 'drizzle-kit'» siempre que las dependencias del proyecto no
 * estuvieran instaladas todavía.
 */
export default {
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: 'netlify/database/migrations',
} satisfies Config;
