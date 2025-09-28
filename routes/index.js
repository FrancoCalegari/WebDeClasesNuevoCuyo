const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

router.get("/", (req, res) => {
  const entradasPath = path.join(__dirname, "../public/assets/data/entradas.json");
  console.log(entradasPath);

  let entradas = [];
  try {
    entradas = JSON.parse(fs.readFileSync(entradasPath, "utf-8"));
  } catch (err) {
    console.error("Error leyendo entradas.json:", err);
  }

  res.render("index", { entradas }); // <-- aquí pasamos la variable
});

module.exports = router;
