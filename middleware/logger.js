const { logInfo } = require("../utils/logger");

function requestLogger(req, res, next) {
  const start = Date.now();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

  logInfo(`INCOMING ${req.method} ${req.originalUrl}`, { ip });

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logInfo(`COMPLETED ${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      time_ms: durationMs,
    });
  });

  next();
}

module.exports = requestLogger;
