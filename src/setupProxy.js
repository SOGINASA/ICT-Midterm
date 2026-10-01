const { createProxyMiddleware } = require("http-proxy-middleware");

// CRA's string proxy replaces Origin, which breaks the API's CSRF checks.
// Preserve both Origin and Host; the development inbox also validates Host.
module.exports = function setupProxy(app) {
  app.use("/api", createProxyMiddleware({
    target: "http://127.0.0.1:8000",
    changeOrigin: false,
    xfwd: true,
    logLevel: "warn",
  }));
};
