const express = require("express");
const session = require("express-session");
const path = require("path");
const sessionConfig = require("./config/sessionConfig");
const indexRoutes = require("./routes/index");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session(sessionConfig));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/", authRoutes);
app.use("/", indexRoutes);
app.use("/admin", adminRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
