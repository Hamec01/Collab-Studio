import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { getConfig } from "./config";

export function getSessionCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 14,
  };
}

export function createSessionMiddleware() {
  const config = getConfig();
  const PgSession = connectPgSimple(session);
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

  return session({
    name: "collab.sid",
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    cookie: getSessionCookieOptions(),
  });
}
