import crypto from "node:crypto";

export const SESSION_COOKIE = "lureva_session";
const DEV_SECRET = "local-only-lureva-session-secret-change-before-deploy";

export const sessionSecret = (env = process.env) => {
  if (env.YELLOW_SESSION_SECRET) return env.YELLOW_SESSION_SECRET.length >= 32 ? env.YELLOW_SESSION_SECRET : "";
  return env.NODE_ENV === "production" ? "" : DEV_SECRET;
};

const signatureFor = (userId, secret) => crypto.createHmac("sha256", secret).update(`lureva-session:v1:${userId}`).digest("base64url");

export const createSessionCookie = (userId, secret) => `${userId}.${signatureFor(userId, secret)}`;

export const verifySessionCookie = (cookieValue, secret) => {
  if (!secret || typeof cookieValue !== "string") return null;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;
  const userId = cookieValue.slice(0, separator);
  const supplied = Buffer.from(cookieValue.slice(separator + 1));
  const expected = Buffer.from(signatureFor(userId, secret));
  if (!userId.startsWith("guest_") || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  return userId;
};

export const readSessionUserId = (req, env = process.env) => {
  const cookies = String(req?.headers?.cookie || "").split(";");
  const value = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return verifySessionCookie(value, sessionSecret(env));
};

export const issueBrowserSession = (req, env = process.env) => {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const existingUserId = readSessionUserId(req, env);
  if (existingUserId) return { userId: existingUserId, cookie: null };
  const userId = `guest_${crypto.randomUUID()}`;
  const secure = env.NODE_ENV === "production" || req.headers?.["x-forwarded-proto"] === "https";
  return {
    userId,
    cookie: `${SESSION_COOKIE}=${createSessionCookie(userId, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`,
  };
};

// Test-only compatibility for legacy integration cases; never enabled in production.
export const testUserId = (body, env = process.env) => env.NODE_ENV !== "production" && env.YELLOW_TEST_ALLOW_USER_ID === "1"
  ? String(body?.userId || "test-guest")
  : null;
