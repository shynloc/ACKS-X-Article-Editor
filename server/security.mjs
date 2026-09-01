import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const COST = 16384;

export function normalizeUsername(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim();
}

export function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase("en-US");
}

export function validUsername(value) {
  const name = normalizeUsername(value);
  return (
    name.length >= 3 && name.length <= 32 && /^[\p{L}\p{N}_-]+$/u.test(name)
  );
}

export function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const output = await derive(password, salt, 32, {
    N: COST,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${COST}$8$1$${salt.toString("base64url")}$${Buffer.from(output).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltText, hashText] = String(encoded).split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hashText, "base64url");
    const actual = Buffer.from(
      await derive(
        password,
        Buffer.from(saltText, "base64url"),
        expected.length,
        { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
      ),
    );
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function inviteHash(code) {
  return createHash("sha256")
    .update(
      String(code || "")
        .trim()
        .toUpperCase(),
    )
    .digest("hex");
}

export function newInviteCode() {
  const raw = randomBytes(15).toString("base64url").toUpperCase();
  return `ACKS-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}
