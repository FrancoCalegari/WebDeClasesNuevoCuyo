module.exports = {
  secret: process.env.SESSION_SECRET || "mi-clave-secreta",
  resave: false,
  saveUninitialized: false,
};
