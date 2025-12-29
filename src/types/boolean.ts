import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1Boolean implements DERImplicitlyTaggable<ASN1Boolean> {
    constructor(public value: boolean) { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.BOOLEAN;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1Boolean.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1Boolean {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1Boolean {
        return ASN1Boolean.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1Boolean {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "Boolean must be primitive");
        }

        const bytes = node.content.value;
        if (bytes.length !== 1) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Boolean must have length 1");
        }

        switch (bytes[0]) {
            case 0x00:
                return new ASN1Boolean(false);
            case 0xff:
                return new ASN1Boolean(true);
            default:
                throw ASN1Error.new(
                    ErrorCode.InvalidASN1Object,
                    "Boolean must be 0x00 or 0xFF in DER"
                );
        }
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1Boolean {
        return ASN1Boolean.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        serializer.appendPrimitiveNode(this.defaultIdentifier(), (buf) => {
            buf.push(this.value ? 0xff : 0x00);
        });
    }
}
