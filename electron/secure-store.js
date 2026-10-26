// Device trust: secrets at rest are encrypted with Electron safeStorage —
// on Windows this is DPAPI, bound to the current OS user account, so copied
// config files are useless on another machine or account.
const { safeStorage } = require("electron");

const SECRET_FIELDS = new Set(["apiKey", "password", "token", "accessToken", "refreshToken", "apiToken", "botToken"]);

function encryptDeep(value) {
  if (Array.isArray(value)) return value.map(encryptDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.has(k) && typeof v === "string" && v && !v.startsWith("enc:")) {
        try {
          out[k] = "enc:" + safeStorage.encryptString(v).toString("base64");
        } catch {
          out[k] = v; // safeStorage unavailable before ready — keep plaintext
        }
      } else {
        out[k] = encryptDeep(v);
      }
    }
    return out;
  }
  return value;
}

function decryptDeep(value) {
  if (Array.isArray(value)) return value.map(decryptDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELDS.has(k) && typeof v === "string" && v.startsWith("enc:")) {
        try {
          out[k] = safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
        } catch {
          out[k] = ""; // undecryptable on this device/account — treat as absent
        }
      } else {
        out[k] = decryptDeep(v);
      }
    }
    return out;
  }
  return value;
}

module.exports = { encryptDeep, decryptDeep, isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() };
