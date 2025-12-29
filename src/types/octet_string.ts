import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1OctetString implements DERImplicitlyTaggable<ASN1OctetString> {
    constructor(public value: Uint8Array) { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.OCTET_STRING;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1OctetString.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1OctetString {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1OctetString {
        return ASN1OctetString.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1OctetString {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "OCTET STRING must be primitive in DER");
        }

        return new ASN1OctetString(node.content.value);
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1OctetString {
        return ASN1OctetString.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        serializer.appendPrimitiveNode(this.defaultIdentifier(), (buf) => {
            for (const b of this.value) buf.push(b);
        });
    }
}
