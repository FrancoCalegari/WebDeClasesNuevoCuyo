const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const {
  getEntradas,
  saveEntradas,
  normalizeMateriaSlug,
  buildMateriaRuta,
  readMateriaClases,
  readMateriaAdjuntos,
  syncMateriaStaticFiles,
  deleteMateriaBundleAssets,
  resolveMateriaBundle,
} = require("../services/dataService");
const { isAuthenticated } = require("../middlewares/auth");

const router = express.Router();

router.use(isAuthenticated);

const PUBLIC_DIR = path.join(__dirname, "..", "public");

const wantsJson = (req) =>
  req.headers["x-requested-with"] === "fetch" ||
  (req.get("accept") || "").includes("application/json");

const successResponse = (req, res, payload = {}) => {
  if (wantsJson(req)) {
    return res.json({ ok: true, ...payload });
  }
  return res.redirect("/admin");
};

const errorResponse = (req, res, message = "Operación inválida", status = 400) => {
  if (wantsJson(req)) {
    return res.status(status).json({ ok: false, message });
  }
  return res.redirect("/admin");
};

const getContext = (entradaIndex, materiaIndex) => {
  const entradas = getEntradas();
  const entrada = entradas?.[entradaIndex];
  const materia = entrada?.materias?.[materiaIndex];

  return { entradas, entrada, materia };
};

const ensureDirectory = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
};

const sanitizeFileName = (fileName = "") => {
  const clean = fileName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return clean || `adjunto-${Date.now()}`;
};

const buildAdjuntoUrl = (absolutePath) => {
  const relative = path.relative(PUBLIC_DIR, absolutePath).replace(/\\/g, "/");
  return `/${relative}`;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { entradaIndex, materiaIndex } = req.params;
      const { entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

      if (!entrada || !materia) {
        return cb(new Error("Materia no encontrada"));
      }

      const bundle = resolveMateriaBundle({
        ruta: materia.ruta,
        slug: materia.slug,
        anio: entrada.anio,
      });
      const targetDir = path.join(bundle.folderPath, "adjuntos");

      ensureDirectory(targetDir);

      return cb(null, targetDir);
    } catch (error) {
      return cb(error);
    }
  },
  filename: (req, file, cb) => {
    const safeName = sanitizeFileName(file.originalname);
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

router.get("/", (req, res) => {
  const entradas = getEntradas();

  res.render("admindashboard", {
    title: "Panel de Administración",
    user: req.session.user,
    entradas,
  });
});

router.get("/data", (req, res) => {
  const entradas = getEntradas();
  return res.json({ ok: true, entradas });
});

router.get("/entrada/:entradaIndex/materia/:materiaIndex/propiedades", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.status(404).json({ ok: false, clases: [], adjuntos: [] });
  }

  const clases = readMateriaClases(materia.ruta);
  const adjuntos = readMateriaAdjuntos(materia.ruta);

  return res.json({
    ok: true,
    clases,
    adjuntos,
    materia: {
      nombre: materia.nombre,
      slug: materia.slug,
      ruta: materia.ruta,
    },
  });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/edit", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const nuevoNombre = req.body.nombre?.trim();
  const activo = req.body.activo === "true";
  const slugPersonalizado = req.body.slug?.trim();

  if (nuevoNombre) {
    const oldBundle = resolveMateriaBundle({
      ruta: materia.ruta,
      slug: materia.slug,
      anio: entrada.anio,
    });
    const clasesActuales = readMateriaClases(oldBundle.ruta, { slug: oldBundle.slug });
    const adjuntosActuales = readMateriaAdjuntos(oldBundle.ruta, { slug: oldBundle.slug });

    const nuevoSlug = slugPersonalizado
      ? normalizeMateriaSlug(slugPersonalizado)
      : materia.slug || normalizeMateriaSlug(nuevoNombre);

    const nuevaRuta = buildMateriaRuta({ slug: nuevoSlug, anio: entrada.anio });
    const rutaCambio = oldBundle.ruta !== nuevaRuta;

    materia.nombre = nuevoNombre;
    materia.slug = nuevoSlug;
    materia.ruta = nuevaRuta;
    materia.activo = activo;

    if (rutaCambio) {
      deleteMateriaBundleAssets(oldBundle);
    }

    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases: clasesActuales,
      adjuntos: adjuntosActuales,
    });

    saveEntradas(entradas);
  }

  return successResponse(req, res, {
    entradaIndex: Number(entradaIndex),
    materiaIndex: Number(materiaIndex),
    materia,
    entrada,
    entradas,
  });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (entrada && materia) {
    deleteMateriaBundleAssets({
      ruta: materia.ruta,
      slug: materia.slug,
      anio: entrada.anio,
    });
    entrada.materias.splice(materiaIndex, 1);
    saveEntradas(entradas);
  }

  return successResponse(req, res, {
    entradaIndex: Number(entradaIndex),
    entradas,
  });
});

router.post("/entrada/:entradaIndex/materia/add", (req, res) => {
  const { entradaIndex } = req.params;
  const { entradas, entrada } = getContext(Number(entradaIndex));

  if (!entrada) {
    return errorResponse(req, res, "Entrada no encontrada", 404);
  }

  const nombre = req.body.nombre?.trim();
  const slugPersonalizado = req.body.slug?.trim();
  const activo = req.body.activo !== "false";

  if (!nombre) {
    return errorResponse(req, res, "Nombre requerido");
  }

  const slug = slugPersonalizado
    ? normalizeMateriaSlug(slugPersonalizado)
    : normalizeMateriaSlug(nombre);
  const ruta = buildMateriaRuta({ slug, anio: entrada.anio });

  const nuevaMateria = { nombre, slug, ruta, activo };
  entrada.materias.push(nuevaMateria);

  syncMateriaStaticFiles(nuevaMateria, { anio: entrada.anio, clases: [], adjuntos: [] });
  saveEntradas(entradas);

  return successResponse(req, res, {
    entradaIndex: Number(entradaIndex),
    materiaIndex: entrada.materias.length - 1,
    materia: nuevaMateria,
    entradas,
  });
});

router.post("/entrada/add", (req, res) => {
  const { anio: anioRaw, year, nombre, slug: slugRaw } = req.body;
  const anio = (anioRaw || year || "").trim();

  if (!anio || !nombre) {
    return errorResponse(req, res, "Año y nombre son requeridos");
  }

  const entradas = getEntradas();
  let entrada = entradas.find((item) => item.anio === anio);

  if (!entrada) {
    entrada = { anio, materias: [] };
    entradas.push(entrada);
  }

  const cleanNombre = nombre.trim();
  const slug = slugRaw ? normalizeMateriaSlug(slugRaw) : normalizeMateriaSlug(cleanNombre);
  const ruta = buildMateriaRuta({ slug, anio });
  const nuevaMateria = { nombre: cleanNombre, slug, ruta, activo: true };

  entrada.materias.push(nuevaMateria);
  syncMateriaStaticFiles(nuevaMateria, { anio, clases: [], adjuntos: [] });
  saveEntradas(entradas);

  return successResponse(req, res, {
    entradas,
  });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/add", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const clases = readMateriaClases(materia.ruta);
  clases.push({
    numero: req.body.numero?.trim() || String(clases.length + 1),
    tema: req.body.tema?.trim() || "Sin tema",
    fecha: req.body.fecha?.trim() || "",
    video: req.body.video?.trim() || "",
    resumen: req.body.resumen?.trim() || "",
  });

  syncMateriaStaticFiles(materia, {
    anio: entrada.anio,
    clases,
    adjuntos: readMateriaAdjuntos(materia.ruta),
  });

  return successResponse(req, res, { clases });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/:claseIndex/edit", (req, res) => {
  const { entradaIndex, materiaIndex, claseIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const clases = readMateriaClases(materia.ruta);
  const index = Number(claseIndex);

  if (!Number.isNaN(index) && clases?.[index]) {
    clases[index] = {
      numero: req.body.numero?.trim() || clases[index].numero,
      tema: req.body.tema?.trim() || clases[index].tema,
      fecha: req.body.fecha?.trim() || clases[index].fecha,
      video: req.body.video?.trim() || clases[index].video,
      resumen: req.body.resumen?.trim() || clases[index].resumen || "",
    };

    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases,
      adjuntos: readMateriaAdjuntos(materia.ruta),
    });
  }

  return successResponse(req, res, { clases });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/:claseIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex, claseIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const clases = readMateriaClases(materia.ruta);
  const index = Number(claseIndex);

  if (!Number.isNaN(index) && clases?.[index]) {
    clases.splice(index, 1);
    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases,
      adjuntos: readMateriaAdjuntos(materia.ruta),
    });
  }

  return successResponse(req, res, { clases });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/add", upload.single("archivo"), (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const adjuntos = readMateriaAdjuntos(materia.ruta);
  const nombre = req.body.nombre?.trim() || req.file?.originalname || "Archivo sin título";
  let ruta = req.body.ruta?.trim() || "";

  if (req.file?.path) {
    ruta = buildAdjuntoUrl(req.file.path);
  }

  adjuntos.push({
    nombre,
    ruta: ruta || "#",
  });

  syncMateriaStaticFiles(materia, {
    anio: entrada.anio,
    clases: readMateriaClases(materia.ruta),
    adjuntos,
  });

  return successResponse(req, res, { adjuntos });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/:adjuntoIndex/edit", upload.single("archivo"), (req, res) => {
  const { entradaIndex, materiaIndex, adjuntoIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const adjuntos = readMateriaAdjuntos(materia.ruta);
  const index = Number(adjuntoIndex);

  if (!Number.isNaN(index) && adjuntos?.[index]) {
    const nombreSubido = req.file?.originalname;
    const rutaSubida = req.file?.path ? buildAdjuntoUrl(req.file.path) : "";
    const formNombre = req.body.nombre?.trim();
    const formRuta = req.body.ruta?.trim();

    adjuntos[index] = {
      nombre: formNombre || nombreSubido || adjuntos[index].nombre,
      ruta: rutaSubida || formRuta || adjuntos[index].ruta,
    };

    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases: readMateriaClases(materia.ruta),
      adjuntos,
    });
  }

  return successResponse(req, res, { adjuntos });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/:adjuntoIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex, adjuntoIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return errorResponse(req, res, "Materia no encontrada", 404);
  }

  const adjuntos = readMateriaAdjuntos(materia.ruta);
  const index = Number(adjuntoIndex);

  if (!Number.isNaN(index) && adjuntos?.[index]) {
    adjuntos.splice(index, 1);
    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases: readMateriaClases(materia.ruta),
      adjuntos,
    });
  }

  return successResponse(req, res, { adjuntos });
});

module.exports = router;
