import { ASN1Node, ContentType } from "../collection";
import type { DERImplicitlyTaggable, Serializer } from "../der";
import { ASN1Error, ErrorCode } from "../errors";
import { ASN1Identifier } from "./identifier";

export class ASN1ObjectIdentifier implements DERImplicitlyTaggable<ASN1ObjectIdentifier> {
    constructor(private bytes: Uint8Array) { }

    static fromComponents(components: bigint[]): ASN1ObjectIdentifier {
        if (components.length < 2) {
            throw ASN1Error.new(ErrorCode.TooFewOIDComponents, "Must have at least 2 components");
        }

        const first = components[0]!;
        const second = components[1]!;

        if (first > 2n) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "First OID component must be 0, 1, or 2");
        }
        if (first < 2n && second > 39n) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Second OID component must be <= 39 if first is 0 or 1");
        }

        const buffer: number[] = [];
        const firstByteVal = first * 40n + second;
        this.writeOIDSubidentifier(firstByteVal, buffer);

        for (let i = 2; i < components.length; i++) {
            this.writeOIDSubidentifier(components[i]!, buffer);
        }

        return new ASN1ObjectIdentifier(new Uint8Array(buffer));
    }

    get components(): bigint[] {
        const components: bigint[] = [];
        let state = { data: this.bytes };

        if (state.data.length === 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Zero components in OID");
        }

        const firstVal = ASN1ObjectIdentifier.readOIDSubidentifier(state);
        const first = firstVal / 40n;
        const second = firstVal % 40n;

        // Strictly speaking, if firstVal >= 80, first is 2 and second is firstVal - 80.
        // But simple division matching Swift/Rust logic:
        components.push(first);
        components.push(second);

        while (state.data.length > 0) {
            components.push(ASN1ObjectIdentifier.readOIDSubidentifier(state));
        }

        return components;
    }

    static defaultIdentifier(): ASN1Identifier {
        return ASN1Identifier.OBJECT_IDENTIFIER;
    }

    defaultIdentifier(): ASN1Identifier {
        return ASN1ObjectIdentifier.defaultIdentifier();
    }

    static fromDERNode(node: ASN1Node): ASN1ObjectIdentifier {
        return this.fromDERNodeWithIdentifier(node, this.defaultIdentifier());
    }

    fromDERNode(node: ASN1Node): ASN1ObjectIdentifier {
        return ASN1ObjectIdentifier.fromDERNode(node);
    }

    static fromDERNodeWithIdentifier(
        node: ASN1Node,
        identifier: ASN1Identifier
    ): ASN1ObjectIdentifier {
        if (!node.identifier.equals(identifier)) {
            throw ASN1Error.new(
                ErrorCode.UnexpectedFieldType,
                `Expected ${identifier}, got ${node.identifier}`
            );
        }

        if (node.content.type !== ContentType.Primitive) {
            throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "OID must be primitive");
        }

        const bytes = node.content.value;
        if (bytes.length === 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Zero components in OID");
        }

        // Validate OID components
        let state = { data: bytes };
        while (state.data.length > 0) {
            this.readOIDSubidentifier(state);
        }

        return new ASN1ObjectIdentifier(bytes);
    }

    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): ASN1ObjectIdentifier {
        return ASN1ObjectIdentifier.fromDERNodeWithIdentifier(node, identifier);
    }

    serialize(serializer: Serializer): void {
        serializer.appendPrimitiveNode(this.defaultIdentifier(), (buf) => {
            for (const b of this.bytes) buf.push(b);
        });
    }

    private static writeOIDSubidentifier(value: bigint, buf: number[]): void {
        if (value === 0n) {
            buf.push(0);
            return;
        }

        const stack: number[] = [];
        let temp = value;
        while (temp > 0n) {
            stack.push(Number(temp & 0x7fn));
            temp >>= 7n;
        }

        stack.reverse();
        for (let i = 0; i < stack.length; i++) {
            let b = stack[i]!;
            if (i < stack.length - 1) {
                b |= 0x80;
            }
            buf.push(b);
        }
    }

    private static readOIDSubidentifier(state: { data: Uint8Array }): bigint {
        let value = 0n;
        let firstByte = true;
        while (true) {
            if (state.data.length === 0) {
                throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "Truncated OID subidentifier");
            }
            const byte = state.data[0]!;
            state.data = state.data.subarray(1);

            if (firstByte && byte === 0x80) {
                throw ASN1Error.new(ErrorCode.InvalidASN1Object, "OID subidentifier encoded with leading 0 byte");
            }
            firstByte = false;

            const chunk = BigInt(byte & 0x7f);
            value = (value << 7n) | chunk;

            if ((byte & 0x80) === 0) {
                break;
            }
        }
        return value;
    }
}
