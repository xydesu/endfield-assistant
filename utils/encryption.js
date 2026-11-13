const crypto = require('crypto');
require('dotenv').config();

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const KEY_BYTES = 32;

// Helper to get and validate 32-byte key buffer
function getKey() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY is missing in .env');
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== KEY_BYTES) {
        throw new Error(`Invalid ENCRYPTION_KEY length: expected ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars), got ${key.length}`);
    }
    return key;
}

function encrypt(text) {
    if (!text) return text;

    try {
        const iv = crypto.randomBytes(12);
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

    if (text.startsWith('gcm:')) {
        const parts = text.split(':');
        if (parts.length !== 4 || !parts[1] || !parts[2] || !parts[3]) {
            throw new Error('Invalid GCM ciphertext format');
        }
        const [, ivHex, authTagHex, encryptedHex] = parts;
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

        const iv = Buffer.from(text.slice(firstColon + 1, secondColon), 'hex');
        const encryptedText = text.slice(secondColon + 1);
        const key = getKey();

        const decipher = crypto.createDecipheriv(CBC_ALGORITHM, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Legacy plain text fallback
    return text;
}

module.exports = { encrypt, decrypt };
