import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1BitString implements DERImplicitlyTaggable<ASN1BitString> {
    constructor(public bytes: Uint8Array, public paddingBits: number) {
        if (paddingBits < 0 || paddingBits > 7) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, `Invalid padding bits: ${paddingBits}`);
        }
        if (bytes.length === 0 && paddingBits !== 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Empty BitString must have 0 padding bits");
        }
    }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.BIT_STRING;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1BitString.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1BitString {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1BitString {
        return ASN1BitString.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1BitString {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "BitString must be primitive in DER");
        }

        const bytes = node.content.value;
        if (bytes.length === 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Empty BIT STRING content (missing padding byte)");
        }

        const paddingBits = bytes[0]!;
        if (paddingBits < 0 || paddingBits > 7) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, `Invalid padding bits value: ${paddingBits}`);
        }

        const data = bytes.subarray(1);
        if (data.length === 0 && paddingBits !== 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Empty BIT STRING with non-zero padding");
        }

        // DER requirement: unused bits must be zero
        if (data.length > 0) {
            const lastByte = data[data.length - 1]!;
            const mask = (1 << paddingBits) - 1;
            if ((lastByte & mask) !== 0) {
                throw ASN1Error.new(ErrorCode.InvalidASN1Object, "BIT STRING unused bits must be zero");
            }
        }

        return new ASN1BitString(data, paddingBits);
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1BitString {
        return ASN1BitString.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        serializer.appendPrimitiveNode(this.defaultIdentifier(), (buf) => {
            buf.push(this.paddingBits);
            for (const b of this.bytes) buf.push(b);
        });
    }
}
