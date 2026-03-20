const crypto = require('crypto');
require('dotenv').config();

const algorithm = 'aes-256-cbc';

// Helper to get key buffer
function getKey() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY is missing in .env');
    }
    return Buffer.from(keyHex, 'hex');
}

function encrypt(text) {
    if (!text) return text;
    
    try {
        const iv = crypto.randomBytes(16);
        const key = getKey();
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Return format: enc:iv_hex:encrypted_hex
        return `enc:${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error('Encryption Failed:', error);
        throw error;
    }
}

function decrypt(text) {
    if (!text) return text;

    // Check if the text is encrypted
    if (!text.startsWith('enc:')) {
        // Assume it's legacy plain text
        return text;
    }

    try {
        // Format: enc:<iv_hex>:<encrypted_hex>
        // Use indexOf to safely split only on the first two colons
        const firstColon = text.indexOf(':');
        const secondColon = text.indexOf(':', firstColon + 1);
        if (firstColon === -1 || secondColon === -1) {
            console.warn('Invalid encrypted format, returning original');
            return text;
        }

        const iv = Buffer.from(text.slice(firstColon + 1, secondColon), 'hex');
        const encryptedText = text.slice(secondColon + 1);
        const key = getKey();

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption Failed:', error);
        // Fallback to original text if decryption fails (safeguard)
        return text;
    }
}

module.exports = { encrypt, decrypt };
