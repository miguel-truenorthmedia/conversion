const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const ACTIVE_LOG_PATH = path.join(LOG_DIR, "conversion.log");

let activeDateKey = null;
let fileStream = null;

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getRotatedLogPath(dateKey) {
  const basePath = path.join(LOG_DIR, `conversion-${dateKey}.log`);
  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  let counter = 1;
  while (true) {
    const candidate = path.join(LOG_DIR, `conversion-${dateKey}-${counter}.log`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function rotateIfNeeded(currentDateKey) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (!fileStream) {
    if (fs.existsSync(ACTIVE_LOG_PATH)) {
      const fileStats = fs.statSync(ACTIVE_LOG_PATH);
      const fileDateKey = getDateKey(fileStats.mtime);
      if (fileDateKey !== currentDateKey) {
        fs.renameSync(ACTIVE_LOG_PATH, getRotatedLogPath(fileDateKey));
      }
    }
    fileStream = fs.createWriteStream(ACTIVE_LOG_PATH, { flags: "a" });
    activeDateKey = currentDateKey;
    return;
  }

  if (activeDateKey !== currentDateKey) {
    fileStream.end();
    if (fs.existsSync(ACTIVE_LOG_PATH)) {
      fs.renameSync(ACTIVE_LOG_PATH, getRotatedLogPath(activeDateKey));
    }
    fileStream = fs.createWriteStream(ACTIVE_LOG_PATH, { flags: "a" });
    activeDateKey = currentDateKey;
  }
}

function stringifyMeta(meta) {
  if (meta === undefined) {
    return "";
  }
  if (typeof meta === "string") {
    return ` ${meta}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (error) {
    return " [meta_unserializable]";
  }
}

function write(level, message, meta) {
  const now = new Date();
  const timestamp = now.toISOString();
  const dateKey = getDateKey(now);

  rotateIfNeeded(dateKey);

  const line = `[${timestamp}] ${level} ${message}${stringifyMeta(meta)}`;
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }

  try {
    fileStream.write(`${line}\n`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR log_file_write_failed`, {
      message: error.message,
    });
  }
}

function logInfo(message, meta) {
  write("INFO", message, meta);
}

function logWarn(message, meta) {
  write("WARN", message, meta);
}

function logError(message, meta) {
  write("ERROR", message, meta);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
};
