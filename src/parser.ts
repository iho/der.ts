import { ASN1Error, ErrorCode } from "./errors";
import { ASN1Identifier, TagClass } from "./types/identifier";

export enum EncodingRules {
    Basic = "Basic",
    Distinguished = "Distinguished",
}

export class ParserNode {
    constructor(
        public identifier: ASN1Identifier,
        public depth: number,
        public isConstructed: boolean,
        public encodedBytes: Uint8Array,
        public dataBytes: Uint8Array | null = null
    ) { }

    isEndMarker(): boolean {
        return (
            this.identifier.tagClass === TagClass.Universal &&
            this.identifier.tagNumber === 0n &&
            !this.isConstructed &&
            this.encodedBytes.length === 2 &&
            this.encodedBytes[0] === 0x00 &&
            this.encodedBytes[1] === 0x00
        );
    }
}

export enum ASN1LengthType {
    Indefinite,
    Definite,
}

export type ASN1Length =
    | { type: ASN1LengthType.Indefinite }
    | { type: ASN1LengthType.Definite; value: bigint };

export class ParseResult {
    static readonly MAXIMUM_NODE_DEPTH = 50;
    static readonly MAXIMUM_TOTAL_NODES = 100_000;

    constructor(public nodes: ParserNode[]) { }

    static parse(data: Uint8Array, rules: EncodingRules): ParseResult {
        const nodes: ParserNode[] = [];
        let state = { data, nodeCount: 0 };

        this._parseNode(state, rules, 1, nodes);

        if (state.data.length > 0) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Trailing unparsed data is present");
        }

        return new ParseResult(nodes);
    }

    private static _parseNode(
        state: { data: Uint8Array; nodeCount: number },
        rules: EncodingRules,
        depth: number,
        nodes: ParserNode[]
    ): void {
        state.nodeCount++;
        if (state.nodeCount > this.MAXIMUM_TOTAL_NODES) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Excessive number of ASN.1 nodes");
        }

        if (depth > this.MAXIMUM_NODE_DEPTH) {
            throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Excessive stack depth was reached");
        }

        if (state.data.length === 0) {
            throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
        }

        const originalData = state.data;
        const rawIdentifier = state.data[0];
        if (rawIdentifier === undefined) {
            throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
        }
        state.data = state.data.subarray(1);

        const constructed = (rawIdentifier & 0x20) !== 0;
        let identifier: ASN1Identifier;

        if ((rawIdentifier & 0x1f) === 0x1f) {
            const tagClass = ASN1Identifier.fromTopByte(rawIdentifier);
            const { value: tagNumber } = this.readASN1DisciplineUint(state);
            if (tagNumber < 31n) {
                throw ASN1Error.new(
                    ErrorCode.InvalidASN1Object,
                    `ASN.1 tag incorrectly encoded in long form: ${tagNumber}`
                );
            }
            identifier = new ASN1Identifier(tagNumber, tagClass);
        } else {
            identifier = ASN1Identifier.fromShortIdentifier(rawIdentifier);
        }

        const minimalEncoding = rules === EncodingRules.Distinguished;
        const wideLength = this.readASN1Length(state, minimalEncoding);

        if (wideLength.type === ASN1LengthType.Definite) {
            const length = Number(wideLength.value);
            if (state.data.length < length) {
                throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
            }

            const subData = state.data.subarray(0, length);
            state.data = state.data.subarray(length);

            const consumed = originalData.length - state.data.length;
            const encodedBytes = originalData.subarray(0, consumed);

            if (constructed) {
                nodes.push(new ParserNode(identifier, depth, true, encodedBytes));

                let checkSub = { data: subData, nodeCount: state.nodeCount };
                while (checkSub.data.length > 0) {
                    this._parseNode(checkSub, rules, depth + 1, nodes);
                }
                state.nodeCount = checkSub.nodeCount;
            } else {
                nodes.push(new ParserNode(identifier, depth, false, encodedBytes, subData));
            }
        } else {
            // Indefinite length
            if (rules === EncodingRules.Distinguished) {
                throw ASN1Error.new(
                    ErrorCode.UnsupportedFieldLength,
                    "Indefinite form of field length not supported in DER."
                );
            }
            if (!constructed) {
                throw ASN1Error.new(
                    ErrorCode.UnsupportedFieldLength,
                    "Indefinite-length field must have constructed identifier"
                );
            }

            const placeholder = new ParserNode(identifier, depth, true, new Uint8Array(0));
            nodes.push(placeholder); // Placeholder

            while (true) {
                if (state.data.length === 0) {
                    throw ASN1Error.new(
                        ErrorCode.TruncatedASN1Field,
                        "Indefinite-length field missing end-of-content marker"
                    );
                }
                this._parseNode(state, rules, depth + 1, nodes);
                const lastNode = nodes[nodes.length - 1];
                if (!lastNode) {
                    throw ASN1Error.new(ErrorCode.InvalidASN1Object, "Unexpected empty nodes list");
                }
                if (lastNode.isEndMarker()) {
                    nodes.pop(); // Remove EOC marker from output node list
                    break;
                }
            }

            const consumed = originalData.length - state.data.length;
            const encodedBytes = originalData.subarray(0, consumed);
            placeholder.encodedBytes = encodedBytes;
        }
    }

    private static readASN1Length(
        state: { data: Uint8Array },
        minimalEncoding: boolean
    ): ASN1Length {
        if (state.data.length === 0) {
            throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
        }
        const firstByte = state.data[0];
        if (firstByte === undefined) {
            throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
        }
        state.data = state.data.subarray(1);

        if (firstByte === 0x80) {
            return { type: ASN1LengthType.Indefinite };
        }

        if ((firstByte & 0x80) === 0x80) {
            // Long form
            const fieldLength = firstByte & 0x7f;
            if (state.data.length < fieldLength) {
                throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
            }
            const lengthBytes = state.data.subarray(0, fieldLength);
            state.data = state.data.subarray(fieldLength);

            let length = 0n;
            for (const b of lengthBytes) {
                length = length * 256n + BigInt(b);
            }

            if (minimalEncoding) {
                if (length < 128n) {
                    throw ASN1Error.new(
                        ErrorCode.UnsupportedFieldLength,
                        "Field length encoded in long form, but DER requires short form"
                    );
                }
                const requiredBytes = this.minimalOctetLen(length);
                if (fieldLength > requiredBytes) {
                    throw ASN1Error.new(
                        ErrorCode.UnsupportedFieldLength,
                        "Field length encoded in excessive number of bytes"
                    );
                }
            }

            return { type: ASN1LengthType.Definite, value: length };
        } else {
            return { type: ASN1LengthType.Definite, value: BigInt(firstByte) };
        }
    }

    private static readASN1DisciplineUint(state: { data: Uint8Array }): {
        value: bigint;
        read: number;
    } {
        let value = 0n;
        let read = 0;
        while (true) {
            if (state.data.length === 0) {
                throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
            }
            const byte = state.data[0];
            if (byte === undefined) {
                throw ASN1Error.new(ErrorCode.TruncatedASN1Field, "");
            }
            state.data = state.data.subarray(1);
            read++;
            const chunk = BigInt(byte & 0x7f);
            value = value * 128n + chunk;
            if ((byte & 0x80) === 0) {
                break;
            }
        }
        return { value, read };
    }

    private static minimalOctetLen(value: bigint): number {
        if (value === 0n) return 1;
        let s = value.toString(16);
        if (s.length % 2 !== 0) s = "0" + s;
        return s.length / 2;
    }
}
