/**
 * Dibujo y descarga del carnet digital.
 *
 * El carnet se pinta directamente sobre un `<canvas>` en vez de fotografiar el
 * DOM. La captura del DOM (html2canvas) no sirve aquí: Tailwind 4 resuelve las
 * opacidades a `color-mix()`/`color(srgb …)`, funciones de color que el
 * capturador no sabe leer y ante las que aborta, así que la descarga fallaba
 * siempre. Dibujar a mano también arregla el guardado en el móvil, donde un
 * enlace con `download` y una URL de datos no descarga nada: con un `Blob` y la
 * hoja de compartir del sistema, el carnet se guarda en Fotos.
 */

export interface CarnetTheme {
  /** Degradado del fondo, tal como lo usa la tarjeta en pantalla. */
  bg: string;
  /** Color de acento en «r,g,b», para componer opacidades. */
  rgb: string;
  hex: string;
  name: string;
}

export const THEMES = {
  magenta: {
    bg: 'linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    rgb: '227,61,160',
    hex: '#E33DA0',
    name: 'Magenta',
  },
  cyan: {
    bg: 'linear-gradient(160deg, #021B1A 0%, #064E4D 50%, #010F0E 100%)',
    rgb: '55,217,166',
    hex: '#37D9A6',
    name: 'Cyan',
  },
  purple: {
    bg: 'linear-gradient(160deg, #1A0B2E 0%, #4B1D52 50%, #11071F 100%)',
    rgb: '176,132,245',
    hex: '#B084F5',
    name: 'Purple',
  },
  amber: {
    bg: 'linear-gradient(160deg, #2E1B00 0%, #5C3A00 50%, #1A0F00 100%)',
    rgb: '245,184,65',
    hex: '#F5B841',
    name: 'Amber',
  },
} as const satisfies Record<string, CarnetTheme>;

export type ThemeId = keyof typeof THEMES;

export function temaDeCarnet(id?: string | null): CarnetTheme {
  return THEMES[(id || '') as ThemeId] || THEMES.magenta;
}

export interface CarnetDatos {
  nombre: string;
  nivel: string;
  tipo: string;
  rol: string;
  fotoUrl?: string;
  brandName?: string;
  logoUrl?: string;
  /** Canvas con el QR ya pintado; es lo único que no se dibuja aquí. */
  qrCanvas: HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

/** Ancho de la tarjeta en pantalla; todo el dibujo usa estas mismas unidades. */
const ANCHO = 340;
const PAD_X = 24;
const PAD_TOP = 32;
const PAD_BOTTOM = 40;
const RADIO = 32;
const AVATAR = 96;
const QR_LADO = 110;
const QR_MARGEN = 10;
const PILL_ALTO = 40;
const FUENTE = "'Outfit', 'DM Sans', system-ui, sans-serif";

/** Factor por defecto: 340×~560 a 3× da un PNG nítido para imprimir. */
export const ESCALA_CARNET = 3;

// ---------------------------------------------------------------------------
// Utilidades de dibujo
// ---------------------------------------------------------------------------

function rgba(theme: CarnetTheme, alpha: number): string {
  return `rgba(${theme.rgb}, ${alpha})`;
}

function rectRedondeado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

/**
 * Degradado lineal equivalente al de CSS. El ángulo se mide como en
 * `linear-gradient`: 0° apunta hacia arriba y crece en sentido horario.
 */
function degradado(
  ctx: CanvasRenderingContext2D,
  grados: number,
  w: number,
  h: number,
  colores: string[]
): CanvasGradient {
  const rad = (grados * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const largo = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const grad = ctx.createLinearGradient(
    cx - (dx * largo) / 2,
    cy - (dy * largo) / 2,
    cx + (dx * largo) / 2,
    cy + (dy * largo) / 2
  );
  colores.forEach((color, i) => grad.addColorStop(i / (colores.length - 1), color));
  return grad;
}

/** Colores del degradado del tema, leídos de su declaración CSS. */
function coloresDeTema(theme: CarnetTheme): string[] {
  const encontrados = theme.bg.match(/#[0-9a-fA-F]{3,8}/g);
  return encontrados && encontrados.length >= 2 ? encontrados : ['#0f0c29', '#302b63', '#24243e'];
}

/**
 * Texto con separación entre letras. `ctx.letterSpacing` no existe en todos los
 * navegadores, así que se dibuja carácter por carácter para que el carnet salga
 * igual en todos.
 */
function textoEspaciado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  cx: number,
  y: number,
  espacio: number
) {
  const letras = [...texto];
  const ancho =
    letras.reduce((total, letra) => total + ctx.measureText(letra).width, 0) +
    espacio * Math.max(0, letras.length - 1);
  let x = cx - ancho / 2;
  const alineacion = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const letra of letras) {
    ctx.fillText(letra, x, y);
    x += ctx.measureText(letra).width + espacio;
  }
  ctx.textAlign = alineacion;
  return ancho;
}

/**
 * Reparte el nombre en una o dos líneas y reduce el tamaño hasta que quepa, que
 * es lo que hace el navegador con la tarjeta en pantalla.
 */
function ajustarNombre(
  ctx: CanvasRenderingContext2D,
  nombre: string,
  maxAncho: number
): { lineas: string[]; tamano: number } {
  const cabe = (lineas: string[], tamano: number) => {
    ctx.font = `800 ${tamano}px ${FUENTE}`;
    return lineas.every((linea) => ctx.measureText(linea).width <= maxAncho);
  };

  for (let tamano = 30; tamano >= 20; tamano -= 2) {
    if (cabe([nombre], tamano)) return { lineas: [nombre], tamano };
  }

  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length > 1) {
    // Corte por el punto que deja las dos líneas más parejas.
    let mejor = 1;
    let menorDiferencia = Infinity;
    for (let corte = 1; corte < palabras.length; corte++) {
      const diferencia = Math.abs(
        palabras.slice(0, corte).join(' ').length - palabras.slice(corte).join(' ').length
      );
      if (diferencia < menorDiferencia) {
        menorDiferencia = diferencia;
        mejor = corte;
      }
    }
    const lineas = [palabras.slice(0, mejor).join(' '), palabras.slice(mejor).join(' ')];
    for (let tamano = 26; tamano >= 16; tamano -= 2) {
      if (cabe(lineas, tamano)) return { lineas, tamano };
    }
    return { lineas, tamano: 16 };
  }

  return { lineas: [nombre], tamano: 20 };
}

/** Candado del distintivo de tipo de alumno. */
function iconoCandado(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy - 1.6, 2.6, Math.PI, 2 * Math.PI);
  ctx.stroke();
  rectRedondeado(ctx, cx - 4.4, cy - 1.6, 8.8, 6.4, 1.6);
  ctx.stroke();
  ctx.restore();
}

/** Silueta del distintivo de rol. */
function iconoPersona(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy - 3, 2.4, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 5.4, 4.6, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/**
 * Carga una imagen para el canvas. Las remotas se piden con CORS para que el
 * PNG siga siendo exportable; si el servidor no lo permite, o tarda, se
 * devuelve `null` y el carnet se dibuja sin ella en lugar de fallar entero.
 */
function cargarImagen(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    const listo = (valor: HTMLImageElement | null) => resolve(valor);
    img.onload = () => listo(img);
    img.onerror = () => listo(null);
    window.setTimeout(() => listo(null), 6000);
    img.src = src;
  });
}

/** Las tipografías del carnet vienen de la red: sin ellas el PNG sale en Arial. */
async function esperarTipografias() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 30px ${FUENTE}`),
      document.fonts.load(`900 italic 36px ${FUENTE}`),
      document.fonts.load(`600 12px ${FUENTE}`),
    ]);
    await document.fonts.ready;
  } catch {
    /* si la fuente no carga, el dibujo sigue con la de reserva */
  }
}

// ---------------------------------------------------------------------------
// Dibujo del carnet
// ---------------------------------------------------------------------------

export async function dibujarCarnet(
  datos: CarnetDatos,
  theme: CarnetTheme,
  escala = ESCALA_CARNET
): Promise<HTMLCanvasElement> {
  await esperarTipografias();
  const [logo, foto] = await Promise.all([cargarImagen(datos.logoUrl), cargarImagen(datos.fotoUrl)]);

  const medidor = document.createElement('canvas').getContext('2d');
  if (!medidor) throw new Error('El navegador no permite generar la imagen del carnet');

  const anchoTexto = ANCHO - PAD_X * 2;
  const nombre = ajustarNombre(medidor, (datos.nombre || '').trim().toUpperCase(), anchoTexto);
  const altoMarca = logo ? 48 : 40;
  // El QR se pinta a tamaño real, sin reescalar, para que no pierda nitidez.
  const qrLado = datos.qrCanvas.width > 0 ? datos.qrCanvas.width / escala : QR_LADO;
  const placaLado = qrLado + QR_MARGEN * 2;
  const altoNombre = nombre.lineas.length * (nombre.tamano * 1.15);

  const alto =
    PAD_TOP +
    altoMarca +
    4 +
    14 +
    24 + // «Carnet digital»
    AVATAR +
    12 +
    altoNombre +
    8 +
    16 +
    24 + // nivel
    placaLado +
    24 +
    14 +
    24 + // «Único e intransferible»
    PILL_ALTO +
    PAD_BOTTOM;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ANCHO * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite generar la imagen del carnet');
  ctx.scale(escala, escala);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  const centro = ANCHO / 2;

  // Fondo y recorte de la tarjeta
  ctx.save();
  rectRedondeado(ctx, 0, 0, ANCHO, alto, RADIO);
  ctx.clip();
  ctx.fillStyle = degradado(ctx, 160, ANCHO, alto, coloresDeTema(theme));
  ctx.fillRect(0, 0, ANCHO, alto);

  // Halo del color del tema
  const halo = ctx.createRadialGradient(centro, alto / 2, 0, centro, alto / 2, alto * 0.6);
  halo.addColorStop(0, rgba(theme, 0.28));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, ANCHO, alto);

  // Trama de puntos
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 2; y < alto; y += 12) {
    for (let x = 2; x < ANCHO; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Marca de agua «DANCE»
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 italic 128px ${FUENTE}`;
  ctx.translate(centro, alto * 0.28);
  ctx.transform(1, -0.105, 0, 1, 0, 0);
  ctx.fillText('DANCE', 0, 0);
  ctx.restore();

  let y = PAD_TOP;

  // Marca: logo si hay, y si no el nombre comercial
  if (logo) {
    const escalaLogo = Math.min(48 / logo.height, anchoTexto / logo.width, 1);
    const w = logo.width * escalaLogo;
    const h = logo.height * escalaLogo;
    ctx.save();
    ctx.shadowColor = rgba(theme, 0.8);
    ctx.shadowBlur = 15;
    ctx.drawImage(logo, centro - w / 2, y + (48 - h) / 2, w, h);
    ctx.restore();
    y += 48;
  } else {
    ctx.save();
    ctx.shadowColor = rgba(theme, 0.8);
    ctx.shadowBlur = 15;
    ctx.font = `900 italic 36px ${FUENTE}`;
    const marca = (datos.brandName || '').trim();
    if (marca) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(marca, centro, y + 30);
    } else {
      // «DanceB»: la B lleva el color del tema, igual que en pantalla.
      const anchoDance = ctx.measureText('Dance').width;
      const anchoB = ctx.measureText('B').width;
      const inicio = centro - (anchoDance + anchoB) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Dance', inicio, y + 30);
      ctx.fillStyle = theme.hex;
      ctx.fillText('B', inicio + anchoDance, y + 30);
      ctx.textAlign = 'center';
    }
    ctx.restore();
    y += 40;
  }
  y += 4;

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `500 10px ${FUENTE}`;
  textoEspaciado(ctx, 'CARNET DIGITAL', centro, y + 10, 3);
  y += 14 + 24;

  // Foto o inicial
  const avatarCx = centro;
  const avatarCy = y + AVATAR / 2;
  ctx.save();
  ctx.shadowColor = rgba(theme, 0.5);
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, AVATAR / 2, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();
  ctx.restore();

  if (foto) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR / 2 - 1, 0, 2 * Math.PI);
    ctx.clip();
    // Recorte tipo «cover»: la foto llena el círculo sin deformarse.
    const escalaFoto = Math.max(AVATAR / foto.width, AVATAR / foto.height);
    const w = foto.width * escalaFoto;
    const h = foto.height * escalaFoto;
    ctx.drawImage(foto, avatarCx - w / 2, avatarCy - h / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 36px ${FUENTE}`;
    ctx.fillText((datos.nombre || '?').trim().charAt(0).toUpperCase(), avatarCx, avatarCy + 13);
  }
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, AVATAR / 2, 0, 2 * Math.PI);
  ctx.strokeStyle = theme.hex;
  ctx.lineWidth = 2;
  ctx.stroke();
  y += AVATAR + 12;

  // Nombre
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 ${nombre.tamano}px ${FUENTE}`;
  const salto = nombre.tamano * 1.15;
  nombre.lineas.forEach((linea, i) => {
    ctx.fillText(linea, centro, y + nombre.tamano * 0.92 + i * salto);
  });
  y += altoNombre + 8;

  // Nivel, entre dos líneas degradadas
  const nivel = (datos.nivel || 'Nivel Básico').trim().toUpperCase();
  ctx.font = `600 12px ${FUENTE}`;
  const medioNivel = y + 12;
  const anchoNivel =
    [...nivel].reduce((t, l) => t + ctx.measureText(l).width, 0) + 2.4 * Math.max(0, nivel.length - 1);
  const huecoLinea = 8;
  const finIzq = centro - anchoNivel / 2 - huecoLinea;
  const iniDer = centro + anchoNivel / 2 + huecoLinea;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  const lineaIzq = ctx.createLinearGradient(PAD_X, 0, finIzq, 0);
  lineaIzq.addColorStop(0, 'rgba(0,0,0,0)');
  lineaIzq.addColorStop(1, theme.hex);
  ctx.strokeStyle = lineaIzq;
  ctx.beginPath();
  ctx.moveTo(PAD_X, medioNivel - 4);
  ctx.lineTo(finIzq, medioNivel - 4);
  ctx.stroke();
  const lineaDer = ctx.createLinearGradient(ANCHO - PAD_X, 0, iniDer, 0);
  lineaDer.addColorStop(0, 'rgba(0,0,0,0)');
  lineaDer.addColorStop(1, theme.hex);
  ctx.strokeStyle = lineaDer;
  ctx.beginPath();
  ctx.moveTo(iniDer, medioNivel - 4);
  ctx.lineTo(ANCHO - PAD_X, medioNivel - 4);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  textoEspaciado(ctx, nivel, centro, medioNivel, 2.4);
  y += 16 + 24;

  // QR sobre placa blanca, con las cuatro esquinas del tema
  const placaX = centro - placaLado / 2;
  const placaY = y;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  rectRedondeado(ctx, placaX, placaY, placaLado, placaLado, 12);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(datos.qrCanvas, placaX + QR_MARGEN, placaY + QR_MARGEN, qrLado, qrLado);
  ctx.restore();

  const esquina = placaLado / 3;
  const margenEsq = 8;
  ctx.save();
  ctx.strokeStyle = theme.hex;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = rgba(theme, 0.6);
  ctx.shadowBlur = 15;
  const bx = placaX - margenEsq;
  const by = placaY - margenEsq;
  const bl = placaLado + margenEsq * 2;
  const esquinas: [number, number, number, number][] = [
    [bx, by + esquina, bx, by],
    [bx, by, bx + esquina, by],
    [bx + bl - esquina, by, bx + bl, by],
    [bx + bl, by, bx + bl, by + esquina],
    [bx, by + bl - esquina, bx, by + bl],
    [bx, by + bl, bx + esquina, by + bl],
    [bx + bl - esquina, by + bl, bx + bl, by + bl],
    [bx + bl, by + bl - esquina, bx + bl, by + bl],
  ];
  for (const [x1, y1, x2, y2] of esquinas) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
  y += placaLado + 24;

  ctx.save();
  ctx.fillStyle = theme.hex;
  ctx.font = `700 10px ${FUENTE}`;
  ctx.shadowColor = rgba(theme, 0.8);
  ctx.shadowBlur = 8;
  textoEspaciado(ctx, 'ÚNICO E INTRANSFERIBLE', centro, y + 10, 1.6);
  ctx.restore();
  y += 14 + 24;

  // Distintivos de tipo y rol
  const hueco = 12;
  const anchoPill = (anchoTexto - hueco) / 2;
  const pills: [string, (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void][] = [
    [(datos.tipo || 'Regular').toUpperCase(), iconoCandado],
    [(datos.rol || 'alumno').toUpperCase(), iconoPersona],
  ];
  pills.forEach(([texto, icono], i) => {
    const x = PAD_X + i * (anchoPill + hueco);
    ctx.save();
    ctx.shadowColor = rgba(theme, 0.3);
    ctx.shadowBlur = 15;
    ctx.fillStyle = rgba(theme, 0.1);
    rectRedondeado(ctx, x, y, anchoPill, PILL_ALTO, PILL_ALTO / 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(theme, 0.7);
    ctx.lineWidth = 1;
    rectRedondeado(ctx, x, y, anchoPill, PILL_ALTO, PILL_ALTO / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    // El texto se encoge si no cabe: un rol largo, o una tipografía de reserva
    // más ancha que Outfit, se saldría del distintivo.
    const disponible = anchoPill - 16 - 14;
    let cuerpo = 11;
    let anchoEtiqueta = 0;
    for (;;) {
      ctx.font = `700 ${cuerpo}px ${FUENTE}`;
      anchoEtiqueta =
        [...texto].reduce((t, l) => t + ctx.measureText(l).width, 0) + 1.2 * Math.max(0, texto.length - 1);
      if (anchoEtiqueta <= disponible || cuerpo <= 8) break;
      cuerpo -= 0.5;
    }
    const cxTexto = x + anchoPill / 2 + 8;
    textoEspaciado(ctx, texto, cxTexto, y + PILL_ALTO / 2 + cuerpo / 2 - 1.5, 1.2);
    icono(ctx, cxTexto - anchoEtiqueta / 2 - 10, y + PILL_ALTO / 2);
  });

  ctx.restore();

  // Borde del tema, ya sin recorte
  ctx.strokeStyle = rgba(theme, 0.5);
  ctx.lineWidth = 2;
  rectRedondeado(ctx, 1, 1, ANCHO - 2, alto - 2, RADIO - 1);
  ctx.stroke();

  return canvas;
}

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------

export type ResultadoGuardado = 'compartido' | 'descargado' | 'cancelado';

/** Nombre de archivo seguro a partir del nombre del alumno. */
export function nombreArchivoCarnet(nombre: string): string {
  const limpio = (nombre || 'alumno')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `carnet-${limpio || 'alumno'}.png`;
}

/**
 * Guarda el PNG. En el móvil se ofrece primero la hoja de compartir del
 * sistema, que es la única vía para dejar la imagen en Fotos; en el escritorio
 * (y si compartir no está disponible) se descarga el archivo.
 */
export async function guardarCarnet(
  canvas: HTMLCanvasElement,
  nombreArchivo: string
): Promise<ResultadoGuardado> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo generar la imagen del carnet');

  const file = new File([blob], nombreArchivo, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (datos: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: nombreArchivo });
      return 'compartido';
    } catch (error) {
      // Cerrar la hoja de compartir no es un fallo; cualquier otro motivo cae
      // en la descarga normal.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelado';
    }
  }

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'descargado';
}
