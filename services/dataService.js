const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "assets", "data");
const MATERIAS_DIR = path.join(PUBLIC_DIR, "assets", "materias");
const ROUTES_DIR = path.join(PUBLIC_DIR, "routes");
const ENTRADAS_FILE = path.join(DATA_DIR, "entradas.json");
const CLASES_FILE = path.join(DATA_DIR, "clases.json");
const ADJUNTOS_FILE = path.join(DATA_DIR, "adjuntos.json");
const PLANTILLA_FILE = path.join(ROOT_DIR, "plantilla.html");

const ensureDirectoryExists = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
};

const toSafeString = (value, fallback = "") => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value).trim();
};

const normalizeClaseRecord = (clase = {}, index = 0) => {
  const numeroBase = clase.numero ?? clase.titulo ?? index + 1;
  const temaBase = clase.tema ?? clase.titulo ?? "Sin tema";

  return {
    numero: toSafeString(numeroBase),
    tema: toSafeString(temaBase, "Sin tema"),
    fecha: toSafeString(clase.fecha),
    video: toSafeString(clase.video || clase.link),
    resumen: toSafeString(clase.resumen),
  };
};

const normalizeAdjuntoRecord = (adjunto = {}) => ({
  nombre: toSafeString(adjunto.nombre, "Recurso sin título"),
  ruta: toSafeString(adjunto.ruta, "#"),
});

const readJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`No se pudo leer el archivo JSON ${filePath}:`, error);
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const getEntradas = () => readJson(ENTRADAS_FILE, []);
const saveEntradas = (data) => writeJson(ENTRADAS_FILE, data);

const getClases = () => readJson(CLASES_FILE, {});
const saveClases = (data) => writeJson(CLASES_FILE, data);

const getAdjuntos = () => readJson(ADJUNTOS_FILE, {});
const saveAdjuntos = (data) => writeJson(ADJUNTOS_FILE, data);

const normalizeMateriaSlug = (nombre) =>
  toSafeString(nombre)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

const normalizeYearSegment = (anio) => {
  const safe = toSafeString(anio);
  if (!safe) return "general";

  const numeric = safe.replace(/[^\d]/g, "");
  if (numeric && numeric.length === safe.length) {
    return numeric;
  }

  return normalizeMateriaSlug(safe) || "general";
};

const getMateriaSlugFromRuta = (ruta = "") => {
  const normalized = toSafeString(ruta).replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "routes") {
    if (segments.at(-1) === "index.html") {
      return segments.at(-2);
    }
    return segments.at(-1).replace(".html", "");
  }

  return path.basename(normalized, path.extname(normalized));
};

const getMateriaYearFromRuta = (ruta = "") => {
  const normalized = toSafeString(ruta).replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "routes") {
    return segments[1];
  }
  return undefined;
};

const buildMateriaRuta = ({ slug, anio }) => {
  const materiaSlug = slug || "materia";
  const yearSegment = normalizeYearSegment(anio);
  return path.join("routes", yearSegment, materiaSlug, "index.html").replace(/\\/g, "/");
};

const getMateriaHtmlPath = (rutaHTML) => {
  const normalized = toSafeString(rutaHTML).replace(/\\/g, "/");
  if (!normalized) {
    return path.join(MATERIAS_DIR, "index.html");
  }
  if (normalized.startsWith("routes/")) {
    return path.join(PUBLIC_DIR, normalized);
  }
  return path.join(PUBLIC_DIR, "assets", normalized);
};

const resolveMateriaBundle = ({ ruta, slug, anio } = {}) => {
  const rutaSafe = toSafeString(ruta);
  const computedSlug = (slug && toSafeString(slug)) || getMateriaSlugFromRuta(rutaSafe) || normalizeMateriaSlug(Date.now().toString(36));
  const inferredYear = anio || getMateriaYearFromRuta(rutaSafe);
  const finalRuta = rutaSafe || buildMateriaRuta({ slug: computedSlug, anio: inferredYear });
  const htmlPath = getMateriaHtmlPath(finalRuta);
  const folderPath = path.dirname(htmlPath);
  const clasesPath = path.join(folderPath, `clases-${computedSlug}.json`);
  const adjuntosPath = path.join(folderPath, `adjuntos-${computedSlug}.json`);

  return {
    slug: computedSlug,
    ruta: finalRuta.replace(/\\/g, "/"),
    folderPath,
    htmlPath,
    clasesPath,
    adjuntosPath,
    yearSegment: normalizeYearSegment(inferredYear),
  };
};

const buildMateriaHtml = ({ nombre, slug, anio }) => {
  const template = fs.readFileSync(PLANTILLA_FILE, "utf-8");

  return template
    .replace(/{{NOMBRE_MATERIA}}/g, nombre)
    .replace(/{{RUTA_MATERIA}}/g, slug)
    .replace(/{{ANIO_CURSO}}/g, anio || "")
    .replace(/{{YEAR}}/g, new Date().getFullYear());
};

const readMateriaClases = (ruta, meta = {}) => {
  const bundle = resolveMateriaBundle({ ruta, slug: meta.slug, anio: meta.anio });
  if (fs.existsSync(bundle.clasesPath)) {
    const data = readJson(bundle.clasesPath, []);
    return Array.isArray(data)
      ? data.map((item, index) => normalizeClaseRecord(item, index))
      : [];
  }

  const clases = getClases();
  const data = clases[bundle.ruta] || clases[bundle.slug] || [];
  return Array.isArray(data)
    ? data.map((item, index) => normalizeClaseRecord(item, index))
    : [];
};

const readMateriaAdjuntos = (ruta, meta = {}) => {
  const bundle = resolveMateriaBundle({ ruta, slug: meta.slug, anio: meta.anio });
  if (fs.existsSync(bundle.adjuntosPath)) {
    const data = readJson(bundle.adjuntosPath, []);
    return Array.isArray(data)
      ? data.map((item) => normalizeAdjuntoRecord(item))
      : [];
  }

  const adjuntos = getAdjuntos();
  const data = adjuntos[bundle.ruta] || adjuntos[bundle.slug] || [];
  return Array.isArray(data)
    ? data.map((item) => normalizeAdjuntoRecord(item))
    : [];
};

const persistMateriaClases = (target, clases) => {
  const bundle =
    typeof target === "string"
      ? resolveMateriaBundle({ ruta: target })
      : target;

  const clasesData = getClases();
  const normalizados = Array.isArray(clases)
    ? clases.map((item, index) => normalizeClaseRecord(item, index))
    : [];
  clasesData[bundle.ruta] = normalizados;
  saveClases(clasesData);

  ensureDirectoryExists(bundle.folderPath);
  writeJson(bundle.clasesPath, normalizados);

  return normalizados;
};

const persistMateriaAdjuntos = (target, adjuntos) => {
  const bundle =
    typeof target === "string"
      ? resolveMateriaBundle({ ruta: target })
      : target;

  const adjuntosData = getAdjuntos();
  const normalizados = Array.isArray(adjuntos)
    ? adjuntos.map((item) => normalizeAdjuntoRecord(item))
    : [];
  adjuntosData[bundle.ruta] = normalizados;
  saveAdjuntos(adjuntosData);

  ensureDirectoryExists(bundle.folderPath);
  writeJson(bundle.adjuntosPath, normalizados);

  return normalizados;
};

const saveMateriaHtml = (rutaHTML, htmlContent) => {
  const destino = getMateriaHtmlPath(rutaHTML);
  ensureDirectoryExists(path.dirname(destino));
  fs.writeFileSync(destino, htmlContent, "utf-8");
};

const syncMateriaStaticFiles = (
  materia,
  { clases, adjuntos, anio } = {}
) => {
  const bundle = resolveMateriaBundle({
    ruta: materia.ruta,
    slug: materia.slug,
    anio,
  });

  const clasesData =
    clases !== undefined ? clases : readMateriaClases(bundle.ruta, { slug: bundle.slug });
  const adjuntosData =
    adjuntos !== undefined ? adjuntos : readMateriaAdjuntos(bundle.ruta, { slug: bundle.slug });

  const html = buildMateriaHtml({
    nombre: materia.nombre,
    slug: bundle.slug,
    anio,
  });

  ensureDirectoryExists(bundle.folderPath);
  saveMateriaHtml(bundle.ruta, html);
  persistMateriaClases(bundle, clasesData);
  persistMateriaAdjuntos(bundle, adjuntosData);

  materia.ruta = bundle.ruta;
  materia.slug = bundle.slug;

  return bundle;
};

const removeMateriaClasesEntry = (ruta, meta = {}) => {
  const clasesData = getClases();
  if (clasesData[ruta]) {
    delete clasesData[ruta];
    saveClases(clasesData);
  }

  const bundle = resolveMateriaBundle({ ruta, ...meta });
  if (fs.existsSync(bundle.clasesPath)) {
    fs.unlinkSync(bundle.clasesPath);
  }
};

const removeMateriaAdjuntosEntry = (ruta, meta = {}) => {
  const adjuntosData = getAdjuntos();
  if (adjuntosData[ruta]) {
    delete adjuntosData[ruta];
    saveAdjuntos(adjuntosData);
  }

  const bundle = resolveMateriaBundle({ ruta, ...meta });
  if (fs.existsSync(bundle.adjuntosPath)) {
    fs.unlinkSync(bundle.adjuntosPath);
  }
};

const deleteMateriaBundleAssets = (target) => {
  const bundle =
    typeof target === "string"
      ? resolveMateriaBundle({ ruta: target })
      : resolveMateriaBundle(target);

  const isRoutesFolder = bundle.folderPath.startsWith(ROUTES_DIR);
  if (isRoutesFolder && fs.existsSync(bundle.folderPath)) {
    fs.rmSync(bundle.folderPath, { recursive: true, force: true });
    const yearDir = path.dirname(bundle.folderPath);
    if (
      yearDir.startsWith(ROUTES_DIR) &&
      fs.existsSync(yearDir) &&
      fs.readdirSync(yearDir).length === 0
    ) {
      fs.rmdirSync(yearDir);
    }
  } else {
    if (fs.existsSync(bundle.htmlPath)) fs.unlinkSync(bundle.htmlPath);
    if (fs.existsSync(bundle.clasesPath)) fs.unlinkSync(bundle.clasesPath);
    if (fs.existsSync(bundle.adjuntosPath)) fs.unlinkSync(bundle.adjuntosPath);
  }

  removeMateriaClasesEntry(bundle.ruta, bundle);
  removeMateriaAdjuntosEntry(bundle.ruta, bundle);

  return bundle;
};

module.exports = {
  getEntradas,
  saveEntradas,
  getClases,
  saveClases,
  getAdjuntos,
  saveAdjuntos,
  normalizeMateriaSlug,
  buildMateriaRuta,
  buildMateriaHtml,
  saveMateriaHtml,
  getMateriaSlugFromRuta,
  getMateriaHtmlPath,
  resolveMateriaBundle,
  readMateriaClases,
  readMateriaAdjuntos,
  persistMateriaClases,
  persistMateriaAdjuntos,
  syncMateriaStaticFiles,
  removeMateriaClasesEntry,
  removeMateriaAdjuntosEntry,
  deleteMateriaBundleAssets,
};
