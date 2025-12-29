import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1Null implements DERImplicitlyTaggable<ASN1Null> {
    constructor() { }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.NULL;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1Null.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1Null {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1Null {
        return ASN1Null.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1Null {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "NULL must be primitive");
        }

        if (node.content.value.length !== 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "NULL must have length 0");
        }

        return new ASN1Null();
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1Null {
        return ASN1Null.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        serializer.appendPrimitiveNode(this.defaultIdentifier(), () => { });
    }
}
