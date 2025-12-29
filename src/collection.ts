import { ParserNode } from "./parser";
import { ASN1Identifier } from "./types/identifier";

export enum ContentType {
    Constructed,
    Primitive,
}

export type Content =
    | { type: ContentType.Constructed; value: ASN1NodeCollection }
    | { type: ContentType.Primitive; value: Uint8Array };

export class ASN1Node {
    constructor(
        public identifier: ASN1Identifier,
        public content: Content,
        public encodedBytes: Uint8Array
    ) { }

    isConstructed(): boolean {
        return this.content.type === ContentType.Constructed;
    }
}

export class ASN1NodeCollection {
    constructor(
        public nodes: ParserNode[],
        public start: number,
        public end: number,
        public depth: number
    ) { }

    [Symbol.iterator](): ASN1NodeCollectionIterator {
        return new ASN1NodeCollectionIterator(this.nodes, this.start, this.end, this.depth);
    }
}

export class ASN1NodeCollectionIterator implements Iterator<ASN1Node> {
    private current: number;

    constructor(
        private nodes: ParserNode[],
        private start: number,
        private end: number,
        private depth: number
    ) {
        this.current = start;
    }

    peek(): ASN1Node | null {
        if (this.current >= this.end) {
            return null;
        }
        const index = this.current;
        const endIndex = this.subtreeEndIndex(index);
        return this.cloneNode(index, endIndex);
    }

    next(): IteratorResult<ASN1Node> {
        if (this.current >= this.end) {
            return { done: true, value: undefined };
        }
        const index = this.current;
        const endIndex = this.subtreeEndIndex(index);
        this.current = endIndex;
        return { done: false, value: this.cloneNode(index, endIndex) };
    }

    private subtreeEndIndex(index: number): number {
        const node = this.nodes[index];
        if (!node) return this.end;
        const nodeDepth = node.depth;
        for (let searchIndex = index + 1; searchIndex < this.end; searchIndex++) {
            const nextNode = this.nodes[searchIndex];
            if (nextNode && nextNode.depth <= nodeDepth) {
                return searchIndex;
            }
        }
        return this.end;
    }

    private cloneNode(index: number, endIndex: number): ASN1Node {
        const node = this.nodes[index];
        if (!node) {
            throw new Error("Index out of bounds");
        }
        if (node.isConstructed) {
            const collection = new ASN1NodeCollection(
                this.nodes,
                index + 1,
                endIndex,
                node.depth
            );
            return new ASN1Node(
                node.identifier,
                { type: ContentType.Constructed, value: collection },
                node.encodedBytes
            );
        } else {
            return new ASN1Node(
                node.identifier,
                { type: ContentType.Primitive, value: node.dataBytes! },
                node.encodedBytes
            );
        }
    }
}
