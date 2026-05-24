import bcrypt from "bcryptjs";
import { authConfig } from "../config/auth.config.js";
import * as shopAccountRepo from "../repositories/shopAccount.repository.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, authConfig.bcryptRounds);
}

export async function verifyPassword(plain, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(plain, passwordHash);
}

/** Rehash to current rounds after successful login (backward-compatible). */
export async function rehashPasswordIfNeeded(accountId, plain, currentHash) {
  try {
    const rounds = bcrypt.getRounds(currentHash);
    if (rounds >= authConfig.bcryptRounds) return;
  } catch {
    return;
  }
  const newHash = await hashPassword(plain);
  await shopAccountRepo.updatePasswordHash(accountId, newHash);
}
