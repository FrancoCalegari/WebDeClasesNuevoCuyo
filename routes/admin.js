const express = require("express");
const fs = require("fs");
const {
  getEntradas,
  saveEntradas,
  normalizeMateriaSlug,
  buildMateriaRuta,
  readMateriaClases,
  readMateriaAdjuntos,
  syncMateriaStaticFiles,
  getMateriaSlugFromRuta,
  getMateriaHtmlPath,
  getMateriaClasesFile,
  getMateriaAdjuntosFile,
  removeMateriaClasesEntry,
  removeMateriaAdjuntosEntry,
} = require("../services/dataService");
const { isAuthenticated } = require("../middlewares/auth");

const router = express.Router();

router.use(isAuthenticated);

const getContext = (entradaIndex, materiaIndex) => {
  const entradas = getEntradas();
  const entrada = entradas?.[entradaIndex];
  const materia = entrada?.materias?.[materiaIndex];

  return { entradas, entrada, materia };
};

router.get("/", (req, res) => {
  const entradas = getEntradas();

  res.render("admindashboard", {
    title: "Panel de Administración",
    user: req.session.user,
    entradas,
  });
});

router.get("/entrada/:entradaIndex/materia/:materiaIndex/propiedades", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.status(404).json({ clases: [], adjuntos: [] });
  }

  const clases = readMateriaClases(materia.ruta);
  const adjuntos = readMateriaAdjuntos(materia.ruta);

  return res.json({ clases, adjuntos });
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/edit", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
  }

  const nuevoNombre = req.body.nombre?.trim();
  const activo = req.body.activo === "true";
  const slugPersonalizado = req.body.slug?.trim();

  if (nuevoNombre) {
    const oldRuta = materia.ruta;
    const oldSlug = getMateriaSlugFromRuta(oldRuta);
    const clasesActuales = readMateriaClases(oldRuta);
    const adjuntosActuales = readMateriaAdjuntos(oldRuta);

    const nuevoSlug = slugPersonalizado
      ? normalizeMateriaSlug(slugPersonalizado)
      : normalizeMateriaSlug(nuevoNombre);

    const nuevaRuta = buildMateriaRuta(nuevoSlug);

    materia.nombre = nuevoNombre;
    materia.ruta = nuevaRuta;
    materia.activo = activo;

    if (oldRuta !== nuevaRuta) {
      const oldHtmlPath = getMateriaHtmlPath(oldRuta);
      const oldClasesFile = getMateriaClasesFile(oldSlug);
      const oldAdjuntosFile = getMateriaAdjuntosFile(oldSlug);

      if (fs.existsSync(oldHtmlPath)) fs.unlinkSync(oldHtmlPath);
      if (fs.existsSync(oldClasesFile)) fs.unlinkSync(oldClasesFile);
      if (fs.existsSync(oldAdjuntosFile)) fs.unlinkSync(oldAdjuntosFile);

      removeMateriaClasesEntry(oldRuta);
      removeMateriaAdjuntosEntry(oldRuta);
    }

    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases: clasesActuales,
      adjuntos: adjuntosActuales,
    });
  }

  saveEntradas(entradas);
  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (entrada && materia) {
    const slug = getMateriaSlugFromRuta(materia.ruta);
    const htmlPath = getMateriaHtmlPath(materia.ruta);
    const clasesFile = getMateriaClasesFile(slug);
    const adjuntosFile = getMateriaAdjuntosFile(slug);

    if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    if (fs.existsSync(clasesFile)) fs.unlinkSync(clasesFile);
    if (fs.existsSync(adjuntosFile)) fs.unlinkSync(adjuntosFile);

    removeMateriaClasesEntry(materia.ruta);
    removeMateriaAdjuntosEntry(materia.ruta);

    entrada.materias.splice(materiaIndex, 1);
    saveEntradas(entradas);
  }

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/add", (req, res) => {
  const { entradaIndex } = req.params;
  const { entradas, entrada } = getContext(Number(entradaIndex));

  if (!entrada) {
    return res.redirect("/admin");
  }

  const nombre = req.body.nombre?.trim();
  const slugPersonalizado = req.body.slug?.trim();
  const activo = req.body.activo !== "false";

  if (!nombre) {
    return res.redirect("/admin");
  }

  const slug = slugPersonalizado
    ? normalizeMateriaSlug(slugPersonalizado)
    : normalizeMateriaSlug(nombre);
  const ruta = buildMateriaRuta(slug);

  const nuevaMateria = { nombre, ruta, activo };
  entrada.materias.push(nuevaMateria);
  saveEntradas(entradas);

  syncMateriaStaticFiles(nuevaMateria, { anio: entrada.anio, clases: [], adjuntos: [] });

  res.redirect("/admin");
});

router.post("/entrada/add", (req, res) => {
  const { anio: anioRaw, year, nombre, slug: slugRaw } = req.body;
  const anio = (anioRaw || year || "").trim();

  if (!anio || !nombre) {
    return res.redirect("/admin");
  }

  const entradas = getEntradas();
  let entrada = entradas.find((item) => item.anio === anio);

  if (!entrada) {
    entrada = { anio, materias: [] };
    entradas.push(entrada);
  }

  const slug = slugRaw ? normalizeMateriaSlug(slugRaw) : normalizeMateriaSlug(nombre);
  const ruta = buildMateriaRuta(slug);
  const nuevaMateria = { nombre: nombre.trim(), ruta, activo: true };

  entrada.materias.push(nuevaMateria);
  saveEntradas(entradas);

  syncMateriaStaticFiles(nuevaMateria, { anio, clases: [], adjuntos: [] });

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/add", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
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

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/:claseIndex/edit", (req, res) => {
  const { entradaIndex, materiaIndex, claseIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
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

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/clase/:claseIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex, claseIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
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

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/add", (req, res) => {
  const { entradaIndex, materiaIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
  }

  const adjuntos = readMateriaAdjuntos(materia.ruta);
  adjuntos.push({
    nombre: req.body.nombre?.trim() || "Archivo sin título",
    ruta: req.body.ruta?.trim() || "#",
  });

  syncMateriaStaticFiles(materia, {
    anio: entrada.anio,
    clases: readMateriaClases(materia.ruta),
    adjuntos,
  });

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/:adjuntoIndex/edit", (req, res) => {
  const { entradaIndex, materiaIndex, adjuntoIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
  }

  const adjuntos = readMateriaAdjuntos(materia.ruta);
  const index = Number(adjuntoIndex);

  if (!Number.isNaN(index) && adjuntos?.[index]) {
    adjuntos[index] = {
      nombre: req.body.nombre?.trim() || adjuntos[index].nombre,
      ruta: req.body.ruta?.trim() || adjuntos[index].ruta,
    };

    syncMateriaStaticFiles(materia, {
      anio: entrada.anio,
      clases: readMateriaClases(materia.ruta),
      adjuntos,
    });
  }

  res.redirect("/admin");
});

router.post("/entrada/:entradaIndex/materia/:materiaIndex/adjunto/:adjuntoIndex/delete", (req, res) => {
  const { entradaIndex, materiaIndex, adjuntoIndex } = req.params;
  const { entradas, entrada, materia } = getContext(Number(entradaIndex), Number(materiaIndex));

  if (!entrada || !materia) {
    return res.redirect("/admin");
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

  res.redirect("/admin");
});

module.exports = router;
