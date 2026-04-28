const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const requestLogger = require("./middleware/logger");
const conversionRoutes = require("./routes/conversion");
const { logError, logInfo } = require("./utils/logger");

const app = express();
const port = Number(process.env.PORT) || 3000;
const bigoApiMode = process.env.BIGO_API_MODE || "custom";

app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  })
);
app.use(requestLogger);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/conversion", conversionRoutes);

app.use((err, req, res, next) => {
  logError("UNHANDLED_ERROR", {
    message: err.message,
    stack: err.stack,
  });
  res.status(200).json({
    accepted: false,
    reason: "internal_error",
  });
});

app.listen(port, () => {
  logInfo("Conversion API started", {
    port,
    bigo_api_mode: bigoApiMode,
  });
});
