import { ASN1Error, ErrorCode } from "./errors";
export { ASN1Error, ErrorCode };
import { ASN1Node, ASN1NodeCollection, ASN1NodeCollectionIterator, ContentType } from "./collection";
export { ASN1Node, ASN1NodeCollection, ASN1NodeCollectionIterator, ContentType };
import { EncodingRules, ParseResult } from "./parser";
export { EncodingRules, ParseResult };
import { ASN1Identifier, TagClass } from "./types/identifier";
export { ASN1Identifier, TagClass }

export interface DERParseable<T> {
    fromDERNode(node: ASN1Node): T;
}

export interface DERSerializable {
    serialize(serializer: Serializer): void;
}

export interface DERImplicitlyTaggable<T> extends DERParseable<T>, DERSerializable {
    defaultIdentifier(): ASN1Identifier;
    fromDERNodeWithIdentifier(node: ASN1Node, identifier: ASN1Identifier): T;
}

export function parse(data: Uint8Array): ASN1Node {
    const result = ParseResult.parse(data, EncodingRules.Distinguished);
    const first = result.nodes[0];
    if (!first) {
        throw ASN1Error.new(ErrorCode.InvalidASN1Object, "No nodes parsed");
    }
    const rootDepth = first.depth;

    // Verify single root
    let endIndex = result.nodes.length;
    for (let i = 1; i < result.nodes.length; i++) {
        const node = result.nodes[i];
        if (node && node.depth <= rootDepth) {
            endIndex = i;
            break;
        }
    }

    if (endIndex !== result.nodes.length) {
        throw ASN1Error.new(
            ErrorCode.InvalidASN1Object,
            "ASN1ParseResult unexpectedly allowed multiple root nodes"
        );
    }

    if (first.isConstructed) {
        const collection = new ASN1NodeCollection(result.nodes, 1, endIndex, rootDepth);
        return new ASN1Node(
            first.identifier,
            { type: ContentType.Constructed, value: collection },
            first.encodedBytes
        );
    } else {
        return new ASN1Node(
            first.identifier,
            { type: ContentType.Primitive, value: first.dataBytes! },
            first.encodedBytes
        );
    }
}

export function sequence<T>(
    node: ASN1Node,
    identifier: ASN1Identifier,
    builder: (iter: ASN1NodeCollectionIterator) => T
): T {
    if (!node.identifier.equals(identifier)) {
        throw ASN1Error.new(
            ErrorCode.UnexpectedFieldType,
            `Expected ${identifier}, got ${node.identifier}`
        );
    }
    if (node.content.type !== ContentType.Constructed) {
        throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "Expected constructed node");
    }

    const iter = node.content.value[Symbol.iterator]();
    const result = builder(iter);

    if (iter.peek() !== null) {
        throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Unconsumed sequence nodes");
    }

    return result;
}

export function sequenceOf<T>(
    identifier: ASN1Identifier,
    rootNode: ASN1Node,
    parser: (node: ASN1Node) => T
): T[] {
    if (!rootNode.identifier.equals(identifier)) {
        throw ASN1Error.new(
            ErrorCode.UnexpectedFieldType,
            `Expected ${identifier}, got ${rootNode.identifier}`
        );
    }
    if (rootNode.content.type !== ContentType.Constructed) {
        throw ASN1Error.new(ErrorCode.UnexpectedFieldType, "Expected constructed node");
    }

    const results: T[] = [];
    for (const node of rootNode.content.value) {
        results.push(parser(node));
    }
    return results;
}

export class Serializer {
    private buffer: number[] = [];

    constructor() { }

    serializedBytes(): Uint8Array {
        return new Uint8Array(this.buffer);
    }

    appendPrimitiveNode(
        identifier: ASN1Identifier,
        contentWriter: (buf: number[]) => void
    ): void {
        const content: number[] = [];
        contentWriter(content);
        this.appendNode(identifier, false, new Uint8Array(content));
    }

    appendConstructedNode(
        identifier: ASN1Identifier,
        writer: (serializer: Serializer) => void
    ): void {
        const nested = new Serializer();
        writer(nested);
        const content = nested.serializedBytes();
        this.appendNode(identifier, true, content);
    }

    writeSequence(writer: (serializer: Serializer) => void): void {
        this.appendConstructedNode(ASN1Identifier.SEQUENCE, writer);
    }

    writeSet(writer: (serializer: Serializer) => void): void {
        this.appendConstructedNode(ASN1Identifier.SET, writer);
    }

    /**
     * Re-serialize an existing ASN1Node (useful for round-trip testing).
     * Preserves the exact structure of the parsed node.
     */
    writeNode(node: ASN1Node): void {
        if (node.content.type === ContentType.Primitive) {
            const data = node.content.value;
            this.appendPrimitiveNode(node.identifier, (buf) => {
                for (const b of data) buf.push(b);
            });
        } else {
            this.appendConstructedNode(node.identifier, (nested) => {
                // ASN1NodeCollection is iterable via Symbol.iterator
                const collection = node.content.value;
                for (const child of collection) {
                    nested.writeNode(child);
                }
            });
        }
    }

    serialize(node: DERSerializable): void {
        node.serialize(this);
    }

    private appendNode(
        identifier: ASN1Identifier,
        constructed: boolean,
        content: Uint8Array
    ): void {
        const idBytes = this.encodeIdentifier(identifier, constructed);
        for (const b of idBytes) this.buffer.push(b);

        const lenBytes = this.encodeLength(content.length);
        for (const b of lenBytes) this.buffer.push(b);

        for (const b of content) this.buffer.push(b);
    }

    private encodeIdentifier(identifier: ASN1Identifier, constructed: boolean): number[] {
        const short = identifier.shortForm();
        if (short !== null) {
            let b = short;
            if (constructed) b |= 0x20;
            return [b];
        } else {
            let topByte = 0x1f;
            if (constructed) topByte |= 0x20;
            topByte |= identifier.tagClass << 6;
            const result = [topByte];
            this.writeASN1DisciplineUint(result, identifier.tagNumber);
            return result;
        }
    }

    private writeASN1DisciplineUint(v: number[], n: bigint): void {
        if (n === 0n) {
            v.push(0);
            return;
        }
        const bytes: number[] = [];
        let tempN = n;
        while (tempN !== 0n) {
            bytes.push(Number(tempN & 0x7fn));
            tempN >>= 7n;
        }
        bytes.reverse();
        for (let i = 0; i < bytes.length; i++) {
            const byteValue = bytes[i];
            if (byteValue === undefined) continue;
            let byte = byteValue;
            if (i !== bytes.length - 1) {
                byte |= 0x80;
            }
            v.push(byte);
        }
    }

    private encodeLength(len: number): number[] {
        if (len <= 0x7f) {
            return [len];
        } else {
            const bytes: number[] = [];
            let l = len;
            while (l !== 0) {
                bytes.push(l & 0xff);
                l >>= 8;
            }
            bytes.reverse();
            const indicator = 0x80 | bytes.length;
            return [indicator, ...bytes];
        }
    }
}
