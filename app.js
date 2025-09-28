const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// === Configuración de sesiones ===
app.use(session({
    secret: "mi-clave-secreta", // cámbiala en producción
    resave: false,
    saveUninitialized: false,
}));

// === Middlewares ===
app.use(express.urlencoded({ extended: true })); // para formularios
app.use(express.static(path.join(__dirname, "public"))); // archivos estáticos
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// === Middleware para proteger rutas ===
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect("/login");
}

// === Login ===
app.get("/login", (req, res) => {
    res.render("login", { 
        title: "Iniciar sesión", 
        error: null 
    });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "admin" && password === "1234") {
        req.session.user = { username: "admin" };
        return res.redirect("/admin");
    }

    res.render("login", { 
        title: "Iniciar sesión", 
        error: "Credenciales incorrectas" 
    });
});

// === Logout ===
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// === Página principal ===
const indexRoutes = require("./routes/index");
app.use("/", indexRoutes);




// === Admin Dashboard ===
app.get("/admin", isAuthenticated, (req, res) => {
    const entradasPath = path.join(__dirname, "public/assets/data/entradas.json");
    const entradas = JSON.parse(fs.readFileSync(entradasPath, "utf-8"));

    res.render("admindashboard", { 
        title: "Panel de Administración", 
        user: req.session.user,
        entradas
    });
});
const entradasPath = path.join(__dirname, 'public','assets','data' , "entradas.json");

app.use(express.urlencoded({ extended: true })); // Para leer los datos de forms POST
app.use(express.json());

// Función para cargar entradas
function getEntradas() {
  if (fs.existsSync(entradasPath)) {
    return JSON.parse(fs.readFileSync(entradasPath, "utf8"));
  }
  return [];
}

// Función para guardar entradas
function saveEntradas(data) {
  fs.writeFileSync(entradasPath, JSON.stringify(data, null, 2));
}

// ========== RUTAS ==========

// Editar materia
app.post("/admin/entrada/:entradaIndex/materia/:materiaIndex/edit", (req, res) => {
  const entradas = getEntradas();
  const entradaIndex = parseInt(req.params.entradaIndex);
  const materiaIndex = parseInt(req.params.materiaIndex);

  if (entradas[entradaIndex] && entradas[entradaIndex].materias[materiaIndex]) {
    entradas[entradaIndex].materias[materiaIndex].nombre = req.body.nombre;
    entradas[entradaIndex].materias[materiaIndex].ruta = req.body.ruta;
    entradas[entradaIndex].materias[materiaIndex].activo = req.body.activo === "true";
    saveEntradas(entradas);
  }
  res.redirect("/admin");
});

// Eliminar materia
app.post("/admin/entrada/:entradaIndex/materia/:materiaIndex/delete", (req, res) => {
  const entradas = getEntradas();
  const entradaIndex = parseInt(req.params.entradaIndex);
  const materiaIndex = parseInt(req.params.materiaIndex);

  if (entradas[entradaIndex] && entradas[entradaIndex].materias[materiaIndex]) {
    entradas[entradaIndex].materias.splice(materiaIndex, 1);
    saveEntradas(entradas);
  }
  res.redirect("/admin");
});

// Agregar materia
app.post("/admin/entrada/:entradaIndex/materia/add", (req, res) => {
  const entradas = getEntradas();
  const entradaIndex = parseInt(req.params.entradaIndex);

  if (entradas[entradaIndex]) {
    entradas[entradaIndex].materias.push({
      nombre: req.body.nombre,
      ruta: req.body.ruta,
      activo: req.body.activo === "true",
    });
    saveEntradas(entradas);
  }
  res.redirect("/admin");
});



// === CRUD de JSON de materias ===
const JSON_DIR = path.join(__dirname, "routes/segundoaño/materias2025");

// Listar clases de una materia
app.get("/admin/materia/:nombre", isAuthenticated, (req, res) => {
    const { nombre } = req.params;
    const filePath = path.join(JSON_DIR, `clases-${nombre}.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("Archivo no encontrado");
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.render("admin_materia", { 
        title: `Admin ${nombre}`, 
        clases: data, 
        materia: nombre 
    });
});

// Agregar nueva clase
app.post("/admin/materia/:nombre/add", isAuthenticated, (req, res) => {
    const { nombre } = req.params;
    const filePath = path.join(JSON_DIR, `clases-${nombre}.json`);
    const { numero, tema, fecha, video, resumen } = req.body;

    let data = [];
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    data.push({ numero: Number(numero), tema, fecha, video, resumen });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    res.redirect(`/admin/materia/${nombre}`);
});

// Editar clase
app.post("/admin/materia/:nombre/edit/:numero", isAuthenticated, (req, res) => {
    const { nombre, numero } = req.params;
    const filePath = path.join(JSON_DIR, `clases-${nombre}.json`);
    const { tema, fecha, video, resumen } = req.body;

    let data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const index = data.findIndex(c => c.numero == numero);

    if (index >= 0) {
        data[index] = { numero: Number(numero), tema, fecha, video, resumen };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    res.redirect(`/admin/materia/${nombre}`);
});

// Eliminar clase
app.post("/admin/materia/:nombre/delete/:numero", isAuthenticated, (req, res) => {
    const { nombre, numero } = req.params;
    const filePath = path.join(JSON_DIR, `clases-${nombre}.json`);

    let data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    data = data.filter(c => c.numero != numero);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.redirect(`/admin/materia/${nombre}`);
});

// === Levantar servidor ===
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
