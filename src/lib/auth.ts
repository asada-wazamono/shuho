import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7日
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";

export type SessionUser = {
  id: string;
  loginId: string;
  name: string;
  department: string;
  role: "admin" | "staff";
};

function sign(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

function createSessionPayload(user: SessionUser): string {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  return Buffer.from(payload, "utf-8").toString("base64url");
}

export function getSessionFromCookie(cookieValue: string | undefined): SessionUser | null {
  if (!cookieValue) return null;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig || sign(payloadB64) !== sig) return null;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const data = JSON.parse(json) as SessionUser & { exp: number };
    if (data.exp < Date.now()) return null;
    return {
      id: data.id,
      loginId: data.loginId,
      name: data.name,
      department: data.department,
      role: data.role,
    };
  } catch {
    return null;
  }
}

function verifySession(cookieValue: string): SessionUser | null {
  return getSessionFromCookie(cookieValue);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return verifySession(value);
}

export async function setSession(user: SessionUser): Promise<void> {
  const payload = createSessionPayload(user);
  const sig = sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSession();
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function findUserByLoginId(loginId: string) {
  return prisma.user.findUnique({ where: { loginId } });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}
