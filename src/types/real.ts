import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1Real implements DERImplicitlyTaggable<ASN1Real> {
    constructor(public value: number) { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.REAL;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1Real.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1Real {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1Real {
        return ASN1Real.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1Real {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "REAL must be primitive");
        }

        const bytes = node.content.value;
        if (bytes.length === 0) {
            return new ASN1Real(0.0);
        }

        const first = bytes[0]!;

        // Special values
        if (first === 0x40) return new ASN1Real(Infinity);
        if (first === 0x41) return new ASN1Real(-Infinity);

        // Binary encoding
        if ((first & 0x80) !== 0) {
            const sign = (first & 0x40) !== 0 ? -1 : 1;
            const baseEncoding = (first & 0x30) >> 4;
            const base = [2, 8, 16][baseEncoding] || 2;
            const scaleFactor = (first & 0x0c) >> 2;
            const expLenBits = (first & 0x03);

            let offset = 1;
            let expLen = 0;
            if (expLenBits === 3) {
                expLen = bytes[offset++]!;
            } else {
                expLen = expLenBits + 1;
            }

            if (bytes.length < offset + expLen) {
                throw ASN1Error.new(ErrorCode.InvalidASN1Object, "REAL encoding too short");
            }

            // Read exponent
            let exponent = 0n;
            const expBytes = bytes.subarray(offset, offset + expLen);
            for (const b of expBytes) {
                exponent = (exponent << 8n) | BigInt(b);
            }
            // Sign extend exponent if negative
            if (expBytes[0]! & 0x80) {
                exponent -= (1n << BigInt(expLen * 8));
            }
            offset += expLen;

            // Read mantissa
            let mantissa = 0n;
            const mantissaBytes = bytes.subarray(offset);
            for (const b of mantissaBytes) {
                mantissa = (mantissa << 8n) | BigInt(b);
            }

            // Reconstruct: value = sign * mantissa * (2^scale) * (base^exponent)
            // In DER, base is always 2.
            const value = sign * Number(mantissa) * Math.pow(2, scaleFactor) * Math.pow(base, Number(exponent));
            return new ASN1Real(value);
        }

        throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Decimal REAL encoding not supported");
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1Real {
        return ASN1Real.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        this.serializeWithIdentifier(serializer, this.defaultIdentifier());
    }

    serializeWithIdentifier(serializer: Serializer, identifier: ASN1Identifier): void {
        serializer.appendPrimitiveNode(identifier, (buf) => {
            if (this.value === 0) return;

            if (!isFinite(this.value)) {
                buf.push(this.value > 0 ? 0x40 : 0x41);
                return;
            }

            if (isNaN(this.value)) {
                throw ASN1Error.new(ErrorCode.InvalidASN1Object, "NaN cannot be encoded in DER REAL");
            }

            // Simple binary encoding for DER (Base 2, minimal exponent)
            // IEEE 754 extraction
            const dv = new DataView(new ArrayBuffer(8));
            dv.setFloat64(0, this.value);
            const bits = dv.getBigUint64(0);

            const sign = (bits >> 63n) === 1n;
            let exponent = Number((bits >> 52n) & 0x7ffn) - 1023;
            let mantissa = bits & 0x000fffffffffffffn;

            if (exponent === -1023) {
                // Denormal or zero
                if (mantissa === 0n) return; // already handled
                exponent = -1022; // Denormals have -1022 bias
            } else {
                mantissa |= 0x0010000000000000n; // Add implicit leading 1
            }

            // Adjust mantissa to be an integer (shift right 52 bits)
            exponent -= 52;

            // Trim trailing zeros from mantissa to be minimal
            while (mantissa > 0n && (mantissa & 0xffn) === 0n) {
                mantissa >>= 8n;
                exponent += 8;
            }
            while (mantissa > 0n && (mantissa & 1n) === 0n) {
                mantissa >>= 1n;
                exponent += 1;
            }

            // Encoding byte: Binary=1, Sign, Base=00 (2), Scale=00, ExpLen
            let expBytes = this.encodeI64(exponent);
            let firstByte = 0x80 | (sign ? 0x40 : 0x00);

            if (expBytes.length <= 3) {
                firstByte |= (expBytes.length - 1);
                buf.push(firstByte);
            } else {
                firstByte |= 0x03;
                buf.push(firstByte);
                buf.push(expBytes.length);
            }

            for (const b of expBytes) buf.push(b);

            let mantissaBytes = this.encodeU64(mantissa);
            for (const b of mantissaBytes) buf.push(b);
        });
    }

    private encodeI64(v: number): Uint8Array {
        // Big-endian signed minimal encoding
        if (v === 0) return new Uint8Array([0]);
        const bytes: number[] = [];
        let temp = BigInt(v);
        while (temp !== 0n && temp !== -1n) {
            bytes.push(Number(temp & 0xffn));
            temp >>= 8n;
        }
        if (temp === 0n) {
            if ((bytes[bytes.length - 1]! & 0x80) !== 0) bytes.push(0);
        } else if (temp === -1n) {
            if ((bytes[bytes.length - 1]! & 0x80) === 0) bytes.push(0xff);
        }
        if (bytes.length === 0) bytes.push(v < 0 ? 0xff : 0x00);
        return new Uint8Array(bytes.reverse());
    }

    private encodeU64(v: bigint): Uint8Array {
        // Big-endian unsigned minimal encoding
        if (v === 0n) return new Uint8Array([0]);
        const bytes: number[] = [];
        let temp = v;
        while (temp > 0n) {
            bytes.push(Number(temp & 0xffn));
            temp >>= 8n;
        }
        return new Uint8Array(bytes.reverse());
    }
}
