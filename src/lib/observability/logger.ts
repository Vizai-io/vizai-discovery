type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: process.env.OTEL_SERVICE_NAME ?? "vizai-discovery",
    message,
    ...fields,
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
