const express = require("express");

const router = express.Router();

router.get("/login", (req, res) => {
  res.render("login", { title: "Iniciar sesión", error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "1234") {
    req.session.user = { username: "admin" };
    return res.redirect("/admin");
  }

  return res.render("login", {
    title: "Iniciar sesión",
    error: "Credenciales incorrectas",
  });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;
