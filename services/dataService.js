const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "assets", "data");
const MATERIAS_DIR = path.join(PUBLIC_DIR, "assets", "materias");
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
  nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

const buildMateriaRuta = (slug) => `materias/${slug}.html`;
const getMateriaSlugFromRuta = (ruta = "") =>
  path.basename(ruta, path.extname(ruta));

const buildMateriaHtml = ({ nombre, slug, anio }) => {
  const template = fs.readFileSync(PLANTILLA_FILE, "utf-8");

  return template
    .replace(/{{NOMBRE_MATERIA}}/g, nombre)
    .replace(/{{RUTA_MATERIA}}/g, slug)
    .replace(/{{ANIO_CURSO}}/g, anio || "")
    .replace(/{{YEAR}}/g, new Date().getFullYear());
};

const getMateriaHtmlPath = (rutaHTML) =>
  path.join(PUBLIC_DIR, "assets", rutaHTML);

const getMateriaClasesFile = (slug) =>
  path.join(MATERIAS_DIR, `clases-${slug}.json`);
const getMateriaAdjuntosFile = (slug) =>
  path.join(MATERIAS_DIR, `adjuntos-${slug}.json`);

const readMateriaClases = (ruta) => {
  const slug = getMateriaSlugFromRuta(ruta);
  const perMateriaPath = getMateriaClasesFile(slug);
  if (fs.existsSync(perMateriaPath)) {
    const data = readJson(perMateriaPath, []);
    return Array.isArray(data)
      ? data.map((item, index) => normalizeClaseRecord(item, index))
      : [];
  }

  const clases = getClases();
  const data = clases[ruta] || clases[slug] || [];
  return Array.isArray(data)
    ? data.map((item, index) => normalizeClaseRecord(item, index))
    : [];
};

const readMateriaAdjuntos = (ruta) => {
  const slug = getMateriaSlugFromRuta(ruta);
  const perMateriaPath = getMateriaAdjuntosFile(slug);
  if (fs.existsSync(perMateriaPath)) {
    const data = readJson(perMateriaPath, []);
    return Array.isArray(data)
      ? data.map((item) => normalizeAdjuntoRecord(item))
      : [];
  }

  const adjuntos = getAdjuntos();
  const data = adjuntos[ruta] || adjuntos[slug] || [];
  return Array.isArray(data)
    ? data.map((item) => normalizeAdjuntoRecord(item))
    : [];
};

const persistMateriaClases = (ruta, clases) => {
  const slug = getMateriaSlugFromRuta(ruta);
  const clasesData = getClases();
  const normalizados = Array.isArray(clases)
    ? clases.map((item, index) => normalizeClaseRecord(item, index))
    : [];
  clasesData[ruta] = normalizados;
  saveClases(clasesData);

  ensureDirectoryExists(MATERIAS_DIR);
  writeJson(getMateriaClasesFile(slug), normalizados);
};

const persistMateriaAdjuntos = (ruta, adjuntos) => {
  const slug = getMateriaSlugFromRuta(ruta);
  const adjuntosData = getAdjuntos();
  const normalizados = Array.isArray(adjuntos)
    ? adjuntos.map((item) => normalizeAdjuntoRecord(item))
    : [];
  adjuntosData[ruta] = normalizados;
  saveAdjuntos(adjuntosData);

  ensureDirectoryExists(MATERIAS_DIR);
  writeJson(getMateriaAdjuntosFile(slug), normalizados);
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
  const slug = getMateriaSlugFromRuta(materia.ruta);
  const rutaHTML = materia.ruta;
  const clasesData =
    clases !== undefined ? clases : readMateriaClases(rutaHTML);
  const adjuntosData =
    adjuntos !== undefined ? adjuntos : readMateriaAdjuntos(rutaHTML);

  const html = buildMateriaHtml({
    nombre: materia.nombre,
    slug,
    anio,
  });

  saveMateriaHtml(rutaHTML, html);
  persistMateriaClases(rutaHTML, clasesData);
  persistMateriaAdjuntos(rutaHTML, adjuntosData);
};

const removeMateriaClasesEntry = (ruta) => {
  const clasesData = getClases();
  if (clasesData[ruta]) {
    delete clasesData[ruta];
    saveClases(clasesData);
  }
};

const removeMateriaAdjuntosEntry = (ruta) => {
  const adjuntosData = getAdjuntos();
  if (adjuntosData[ruta]) {
    delete adjuntosData[ruta];
    saveAdjuntos(adjuntosData);
  }
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
  getMateriaClasesFile,
  getMateriaAdjuntosFile,
  readMateriaClases,
  readMateriaAdjuntos,
  persistMateriaClases,
  persistMateriaAdjuntos,
  syncMateriaStaticFiles,
  removeMateriaClasesEntry,
  removeMateriaAdjuntosEntry,
};
