/**
 * Converts a Uint8Array to a hexadecimal string.
 * Uses standard Web API approaches.
 */
export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Converts a Uint8Array to a Base64 string using the standard Web API btoa.
 * This is safe for both browser and Bun/Node environments.
 */
export function toBase64(bytes: Uint8Array): string {
    // String.fromCharCode can handle large arrays via apply, but literal string building
    // is safer for memory in some environments. For ASN.1 chunks, this is usually fine.
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binString);
}

/**
 * Converts a hex string back to a Uint8Array.
 */
export function fromHex(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Converts a Base64 string back to a Uint8Array using atob.
 */
export function fromBase64(base64: string): Uint8Array {
    const binString = atob(base64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
}
