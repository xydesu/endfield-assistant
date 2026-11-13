const crypto = require('crypto');
require('dotenv').config();

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const CBC_IV_BYTES = 16;
const HEX_REGEX = /^[0-9a-f]+$/i;

function isValidHex(str, expectedBytes = null) {
    if (typeof str !== 'string' || str.length === 0 || str.length % 2 !== 0 || !HEX_REGEX.test(str)) {
        return false;
    }
    if (expectedBytes !== null && str.length !== expectedBytes * 2) {
        return false;
    }
    return true;
}

// Helper to get and validate 32-byte key buffer
function getKey() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY is missing in .env');
    }
    if (!isValidHex(keyHex, KEY_BYTES)) {
        throw new Error(`Invalid ENCRYPTION_KEY format or length: expected ${KEY_BYTES * 2} hex chars`);
    }
    return Buffer.from(keyHex, 'hex');
}

function isGcmEncrypted(text) {
    return typeof text === 'string' && text.startsWith('gcm:');
}

function encrypt(text) {
    if (!text) return text;
    if (typeof text !== 'string') {
        throw new TypeError('encrypt() expects a string');
    }

    try {
        const iv = crypto.randomBytes(GCM_IV_BYTES);
        const key = getKey();
        const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        // Format: gcm:<iv_hex>:<authTag_hex>:<encrypted_hex>
        return `gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error('Encryption Failed:', error.message);
        throw error;
    }
}

function decrypt(text) {
    if (!text) return text;
    if (typeof text !== 'string') {
        throw new TypeError('decrypt() expects a string');
    }

    if (text.startsWith('gcm:')) {
        const parts = text.split(':');
        if (parts.length !== 4 || !parts[1] || !parts[2] || !parts[3]) {
            throw new Error('Invalid GCM ciphertext format');
        }
        const [, ivHex, authTagHex, encryptedHex] = parts;
        if (!isValidHex(ivHex, GCM_IV_BYTES) || !isValidHex(authTagHex, GCM_TAG_BYTES) || !isValidHex(encryptedHex)) {
            throw new Error('Invalid GCM ciphertext component length or encoding');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = getKey();

        const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    if (text.startsWith('enc:')) {
        const firstColon = text.indexOf(':');
        const secondColon = text.indexOf(':', firstColon + 1);
        if (firstColon === -1 || secondColon === -1) {
            throw new Error('Invalid legacy CBC ciphertext format');
        }

        const ivHex = text.slice(firstColon + 1, secondColon);
        const encryptedText = text.slice(secondColon + 1);
        if (!isValidHex(ivHex, CBC_IV_BYTES) || !isValidHex(encryptedText)) {
            throw new Error('Invalid legacy CBC ciphertext length or encoding');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const key = getKey();

        const decipher = crypto.createDecipheriv(CBC_ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    if (process.env.STRICT_ENCRYPTION === 'true') {
        throw new Error('Unencrypted credential rejected in STRICT_ENCRYPTION mode');
    }

    // Legacy plain text fallback
    return text;
}

module.exports = { encrypt, decrypt, isGcmEncrypted };
