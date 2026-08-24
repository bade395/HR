import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { companies, localCredentials } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const COOKIE_NAME = "hr_local_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  return Buffer.from(ENV.cookieSecret || "development-only-change-me");
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function signSession(payload: { id: number; username: string; role: string }) {
  const body = JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
  const encoded = Buffer.from(body).toString("base64url");
  const signature = crypto.createHmac("sha256", secretKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readSession(req: Request) {
  const cookieHeader = req.headers.cookie || "";
  const raw = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || "";
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", secretKey()).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload as { id: number; username: string; role: string } : null;
  } catch {
    return null;
  }
}

function setSession(res: Response, payload: { id: number; username: string; role: string }) {
  res.cookie(COOKIE_NAME, signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: ENV.isProduction,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

async function requireCredential(req: Request, res: Response) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
    return null;
  }
  const rows = await db.select().from(localCredentials).where(eq(localCredentials.id, session.id)).limit(1);
  if (!rows[0]) {
    res.status(401).json({ error: "انتهت الجلسة" });
    return null;
  }
  return rows[0];
}

export function registerLocalAuthRoutes(app: Express) {
  app.get("/api/local-auth/status", async (_req, res) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ ready: false, error: "قاعدة البيانات غير متاحة" });
    const rows = await db.select({ id: localCredentials.id }).from(localCredentials).limit(1);
    res.json({ ready: rows.length > 0 });
  });

  app.post("/api/local-auth/setup", async (req, res) => {
    const { username, password, displayName } = req.body ?? {};
    if (!username || !password || String(password).length < 8) return res.status(400).json({ error: "اسم المستخدم مطلوب وكلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
    const existing = await db.select({ id: localCredentials.id }).from(localCredentials).limit(1);
    if (existing.length) return res.status(409).json({ error: "تم إعداد حساب الإدارة مسبقًا" });
    const result = await db.insert(localCredentials).values({ username: String(username).trim(), passwordHash: hashPassword(String(password)), displayName: String(displayName || username).trim(), role: "admin" });
    const id = Number((result as any).insertId);
    setSession(res, { id, username: String(username).trim(), role: "admin" });
    res.json({ success: true });
  });

  app.post("/api/local-auth/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
    const rows = await db.select().from(localCredentials).where(eq(localCredentials.username, String(username || "").trim())).limit(1);
    const credential = rows[0];
    if (!credential || !verifyPassword(String(password || ""), credential.passwordHash)) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    setSession(res, { id: credential.id, username: credential.username, role: credential.role });
    res.json({ success: true, user: { username: credential.username, displayName: credential.displayName, role: credential.role } });
  });

  app.post("/api/local-auth/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: ENV.isProduction, path: "/" });
    res.json({ success: true });
  });

  app.get("/api/local-auth/me", async (req, res) => {
    const credential = await requireCredential(req, res);
    if (!credential) return;
    res.json({ user: { username: credential.username, displayName: credential.displayName, role: credential.role } });
  });

  app.get("/api/companies", async (req, res) => {
    const credential = await requireCredential(req, res);
    if (!credential) return;
    const db = await getDb();
    const rows = await db!.select().from(companies).where(eq(companies.ownerCredentialId, credential.id)).orderBy(desc(companies.createdAt));
    res.json({ companies: rows });
  });

  app.post("/api/companies", async (req, res) => {
    const credential = await requireCredential(req, res);
    if (!credential) return;
    const { name, crNumber, logoUrl, letterheadUrl } = req.body ?? {};
    if (!name || !crNumber) return res.status(400).json({ error: "اسم الشركة ورقم السجل التجاري مطلوبان" });
    const db = await getDb();
    const result = await db!.insert(companies).values({ ownerCredentialId: credential.id, name: String(name).trim(), crNumber: String(crNumber).trim(), logoUrl: logoUrl || null, letterheadUrl: letterheadUrl || null });
    res.status(201).json({ success: true, id: Number((result as any).insertId) });
  });
}

export { COOKIE_NAME as LOCAL_AUTH_COOKIE };
