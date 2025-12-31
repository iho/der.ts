import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1Integer implements DERImplicitlyTaggable<ASN1Integer> {
    constructor(public value: bigint) { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.INTEGER;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1Integer.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1Integer {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1Integer {
        return ASN1Integer.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1Integer {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "Integer must be primitive");
        }

        const bytes = node.content.value;
        if (bytes.length === 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Integer with 0 bytes");
        }

        // DER requires minimal encoding
        if (bytes.length > 1) {
            const first = bytes[0]!;
            const second = bytes[1]!;
            if (first === 0x00) {
                if ((second & 0x80) === 0) {
                    throw ASN1Error.new(
                        ErrorCode.InvalidASN1IntegerEncoding,
                        "Integer encoded with redundant leading zero"
                    );
                }
            } else if (first === 0xff) {
                if ((second & 0x80) === 0x80) {
                    throw ASN1Error.new(
                        ErrorCode.InvalidASN1IntegerEncoding,
                        "Integer encoded with redundant leading FF"
                    );
                }
            }
        }

        return new ASN1Integer(this.fromSignedBytesBE(bytes));
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1Integer {
        return ASN1Integer.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        this.serializeWithIdentifier(serializer, this.defaultIdentifier());
    }

    serializeWithIdentifier(serializer: Serializer, identifier: ASN1Identifier): void {
        serializer.appendPrimitiveNode(identifier, (buf) => {
            const bytes = ASN1Integer.toSignedBytesBE(this.value);
            for (const b of bytes) buf.push(b);
        });
    }

    // Helpers for BigInt <-> Signed Bytes BE
    private static fromSignedBytesBE(bytes: Uint8Array): bigint {
        let value = 0n;
        for (const byte of bytes) {
            value = (value << 8n) | BigInt(byte);
        }

        // Handle negative values (2's complement)
        const msb = bytes[0]!;
        if ((msb & 0x80) !== 0) {
            const bitLength = BigInt(bytes.length * 8);
            value -= 1n << bitLength;
        }

        return value;
    }

    private static toSignedBytesBE(value: bigint): Uint8Array {
        if (value === 0n) {
            return new Uint8Array([0x00]);
        }

        let temp = value;
        const bytes: number[] = [];

        if (value > 0n) {
            while (temp > 0n) {
                bytes.push(Number(temp & 0xffn));
                temp >>= 8n;
            }
            if ((bytes[bytes.length - 1]! & 0x80) !== 0) {
                bytes.push(0x00);
            }
        } else {
            // Negative value
            // To get 2's complement bytes:
            // Find bit length needed.
            // (value + (1 << bitLength)) gives us the unsigned representation.
            let bits = value.toString(2).length; // Approximate
            // Round up to multiple of 8
            let bitLength = Math.ceil((bits + 1) / 8) * 8;
            let unsigned = value + (1n << BigInt(bitLength));

            // Check if we can fit in fewer bytes
            // If the next byte down also has MSB=1, we can drop the top byte.
            // But DER minimal encoding already says we shouldn't have redundant FF.

            temp = unsigned;
            for (let i = 0; i < bitLength / 8; i++) {
                bytes.push(Number(temp & 0xffn));
                temp >>= 8n;
            }

            // Trim redundant leading FF (0xff means -1 in 2's complement)
            while (bytes.length > 1) {
                const last = bytes[bytes.length - 1]!;
                const secondLast = bytes[bytes.length - 2]!;
                if (last === 0xff && (secondLast & 0x80) !== 0) {
                    bytes.pop();
                } else {
                    break;
                }
            }
        }

        return new Uint8Array(bytes.reverse());
    }
}
