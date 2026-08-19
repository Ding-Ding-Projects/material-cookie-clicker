import { safeStorage } from "electron";

import type { CredentialVault } from "../shared/security-locks.js";

export interface EncryptedCredentialStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, encryptedBase64: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

function validateReference(ref: string): void {
  if (!/^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(ref) || ref.includes("..")) {
    throw new Error("Credential reference is invalid.");
  }
}

/**
 * Desktop credential-vault boundary. Only encrypted bytes reach the supplied
 * persistence store; renderer code receives opaque references, never values.
 */
export class SafeStorageCredentialVault implements CredentialVault {
  constructor(private readonly store: EncryptedCredentialStore) {}

  async put(ref: string, secret: string): Promise<void> {
    validateReference(ref);
    if (!safeStorage.isEncryptionAvailable()) throw new Error("The operating-system credential vault is unavailable.");
    const ciphertext = safeStorage.encryptString(secret);
    await this.store.set(ref, ciphertext.toString("base64"));
    ciphertext.fill(0);
  }

  async read(ref: string): Promise<string | null> {
    validateReference(ref);
    if (!safeStorage.isEncryptionAvailable()) throw new Error("The operating-system credential vault is unavailable.");
    const encoded = await this.store.get(ref);
    if (encoded === null) return null;
    const ciphertext = Buffer.from(encoded, "base64");
    try {
      return safeStorage.decryptString(ciphertext);
    } finally {
      ciphertext.fill(0);
    }
  }

  async delete(ref: string): Promise<void> {
    validateReference(ref);
    await this.store.delete(ref);
  }
}
