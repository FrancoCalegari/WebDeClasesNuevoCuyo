const express = require("express");
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

  res.redirect("/admin");
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
  const ruta = buildMateriaRuta({ slug, anio: entrada.anio });

  const nuevaMateria = { nombre, slug, ruta, activo };
  entrada.materias.push(nuevaMateria);

  syncMateriaStaticFiles(nuevaMateria, { anio: entrada.anio, clases: [], adjuntos: [] });
  saveEntradas(entradas);

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

  const cleanNombre = nombre.trim();
  const slug = slugRaw ? normalizeMateriaSlug(slugRaw) : normalizeMateriaSlug(cleanNombre);
  const ruta = buildMateriaRuta({ slug, anio });
  const nuevaMateria = { nombre: cleanNombre, slug, ruta, activo: true };

  entrada.materias.push(nuevaMateria);
  syncMateriaStaticFiles(nuevaMateria, { anio, clases: [], adjuntos: [] });
  saveEntradas(entradas);

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
