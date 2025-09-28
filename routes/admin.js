const express = require("express");
const router = express.Router();

// Middleware de protección
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect("/auth/login");
}

// Ruta protegida
router.get("/dashboard", isAuthenticated, (req, res) => {
    res.render("admindashboard", { user: req.session.user });
});

module.exports = router;
