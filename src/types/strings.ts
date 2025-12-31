import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1UTF8String implements DERImplicitlyTaggable<ASN1UTF8String> {
    constructor(public value: string) { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.UTF8_STRING;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1UTF8String.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1UTF8String {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1UTF8String {
        return ASN1UTF8String.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1UTF8String {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "String must be primitive");
        }

        const bytes = node.content.value;
        const decoder = new TextDecoder("utf-8");
        return new ASN1UTF8String(decoder.decode(bytes));
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1UTF8String {
        return ASN1UTF8String.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        this.serializeWithIdentifier(serializer, this.defaultIdentifier());
    }

    serializeWithIdentifier(serializer: Serializer, identifier: ASN1Identifier): void {
        serializer.appendPrimitiveNode(identifier, (buf) => {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(this.value);
            for (const b of bytes) buf.push(b);
        });
    }
}

// Add more string types as needed (IA5String, PrintableString, etc.)
export class ASN1IA5String extends ASN1UTF8String {
    static override defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.IA5_STRING;
    }

    override defaultIdentifier(): ASN1Identifier {
        return ASN1IA5String.defaultIdentifier();
    }
}

export class ASN1PrintableString extends ASN1UTF8String {
    static override defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.PRINTABLE_STRING;
    }

    override defaultIdentifier(): ASN1Identifier {
        return ASN1PrintableString.defaultIdentifier();
    }
}
