import * as crypto from "crypto";

/**
 * SecretManager - Encrypt and decrypt sensitive data (passwords, tokens)
 * Uses AES-256-CBC encryption
 */
export class SecretManager {
  private algorithm = "aes-256-cbc";
  private key: Buffer;
  private static instance: SecretManager;

  constructor() {
    // Get encryption key from environment variable
    const keyHex = process.env.ENCRYPTION_KEY;

    if (!keyHex) {
      console.warn(
        "[SecretManager] ENCRYPTION_KEY not set in .env - Using default key (NOT SECURE for production!)",
      );
      // Generate a temporary key for development
      this.key = crypto.randomBytes(32);
    } else {
      try {
        this.key = Buffer.from(keyHex, "hex");

        if (this.key.length !== 32) {
          throw new Error(
            "ENCRYPTION_KEY must be 32 bytes (64 hex characters)",
          );
        }
      } catch (error) {
        console.error(
          "[SecretManager] Invalid ENCRYPTION_KEY format:",
          error.message,
        );
        console.error(
          "[SecretManager] Generate key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
        throw error;
      }
    }
  }

  public static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  /**
   * Encrypt sensitive text
   * @param text - Plain text to encrypt
   * @returns Encrypted text in format: iv:encryptedData
   */
  encrypt(text: string): string {
    if (!text) return "";

    try {
      // Generate random IV (Initialization Vector)
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Encrypt
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Return format: iv:encryptedData
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      console.error("[SecretManager] Encryption error:", error);
      throw error;
    }
  }

  /**
   * Decrypt encrypted text
   * @param encryptedText - Encrypted text in format: iv:encryptedData
   * @returns Decrypted plain text
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return "";

    try {
      // Check if text is encrypted (contains ':' separator)
      if (!encryptedText.includes(":")) {
        // Not encrypted (legacy plain text) - return as is
        console.warn(
          "[SecretManager] Decrypting plain text (not encrypted) - consider re-encrypting",
        );
        return encryptedText;
      }

      // Split IV and encrypted data
      const parts = encryptedText.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted text format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

      // Decrypt
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("[SecretManager] Decryption error:", error);
      // Return original text if decryption fails (might be plain text)
      return encryptedText;
    }
  }

  /**
   * Check if text is encrypted
   * @param text - Text to check
   * @returns True if encrypted
   */
  isEncrypted(text: string): boolean {
    if (!text) return false;

    // Check format: iv:encryptedData (both should be hex strings)
    const parts = text.split(":");
    if (parts.length !== 2) return false;

    // IV should be 32 hex chars (16 bytes)
    if (parts[0].length !== 32) return false;

    // Check if both parts are valid hex
    const hexRegex = /^[0-9a-f]+$/i;
    return hexRegex.test(parts[0]) && hexRegex.test(parts[1]);
  }
}

export const getSecretManager = SecretManager.getInstance;
