import { expect, test, describe } from "bun:test";
import { parse, Serializer, sequence, sequenceOf } from "../src/der";
import { ASN1Identifier, TagClass } from "../src/types/identifier";
import { ASN1Integer } from "../src/types/integer";
import { ASN1Boolean } from "../src/types/boolean";
import { ASN1UTF8String } from "../src/types/strings";
import { ASN1Null } from "../src/types/null";
import { ASN1OctetString } from "../src/types/octet_string";
import { ASN1BitString } from "../src/types/bit_string";
import { ASN1ObjectIdentifier } from "../src/types/object_identifier";
import { ASN1Real } from "../src/types/real";
import { ContentType } from "../src/collection";
import { toHex, toBase64, fromHex, fromBase64 } from "../src/utils";

describe("ASN.1 DER Parser", () => {
    test("test_der_sequence_of_success", () => {
        // SEQUENCE { INTEGER 1, INTEGER 2 }
        const data = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
        const node = parse(data);
        const values = sequenceOf(ASN1Identifier.SEQUENCE, node, (n) =>
            ASN1Integer.fromDERNode(n).value
        );
        expect(values).toEqual([1n, 2n]);
    });

    test("test_bool_primitive_roundtrip", () => {
        const bytes = new Uint8Array([0x01, 0x01, 0xFF]);
        const node = parse(bytes);
        const value = ASN1Boolean.fromDERNode(node).value;
        expect(value).toBe(true);

        const serializer = new Serializer();
        new ASN1Boolean(true).serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_string_roundtrip", () => {
        const bytes = new Uint8Array([0x0C, 0x02, 0x48, 0x49]); // UTF8String "HI"
        const node = parse(bytes);
        const value = ASN1UTF8String.fromDERNode(node).value;
        expect(value).toBe("HI");

        const serializer = new Serializer();
        new ASN1UTF8String("HI").serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_signed_integer_roundtrip", () => {
        const bytes = new Uint8Array([0x02, 0x01, 0x7F]);
        const node = parse(bytes);
        const value = ASN1Integer.fromDERNode(node).value;
        expect(value).toBe(127n);

        const serializer = new Serializer();
        new ASN1Integer(127n).serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_negative_integer_roundtrip", () => {
        // -128 in 2's complement is 0x80
        const bytes = new Uint8Array([0x02, 0x01, 0x80]);
        const node = parse(bytes);
        const value = ASN1Integer.fromDERNode(node).value;
        expect(value).toBe(-128n);

        const serializer = new Serializer();
        new ASN1Integer(-128n).serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_complex_sequence_roundtrip", () => {
        // SEQUENCE { INTEGER 42, BOOLEAN true, UTF8String "Bun" }
        const serializer = new Serializer();
        serializer.writeSequence((seq) => {
            new ASN1Integer(42n).serialize(seq);
            new ASN1Boolean(true).serialize(seq);
            new ASN1UTF8String("Bun").serialize(seq);
        });
        const bytes = serializer.serializedBytes();

        const node = parse(bytes);
        const result = sequence(node, ASN1Identifier.SEQUENCE, (iter) => {
            const i = ASN1Integer.fromDERNode(iter.next().value!).value;
            const b = ASN1Boolean.fromDERNode(iter.next().value!).value;
            const s = ASN1UTF8String.fromDERNode(iter.next().value!).value;
            return { i, b, s };
        });

        expect(result).toEqual({ i: 42n, b: true, s: "Bun" });
    });

    test("test_large_integer_roundtrip", () => {
        const val = 123456789012345678901234567890n;
        const serializer = new Serializer();
        new ASN1Integer(val).serialize(serializer);
        const bytes = serializer.serializedBytes();

        const node = parse(bytes);
        const decoded = ASN1Integer.fromDERNode(node).value;
        expect(decoded).toBe(val);
    });

    test("test_long_form_length", () => {
        // Octet String with 200 bytes (length > 127)
        const payload = new Uint8Array(200).fill(0x61);
        const serializer = new Serializer();
        serializer.appendPrimitiveNode(ASN1Identifier.OCTET_STRING, (buf) => {
            for (const b of payload) buf.push(b);
        });
        const bytes = serializer.serializedBytes();

        // Tag 0x04, Length 0x81 0xC8 (200), payload...
        expect(bytes[0]).toBe(0x04);
        expect(bytes[1]).toBe(0x81);
        expect(bytes[2]).toBe(200);

        const node = parse(bytes);
        expect(node.content.type).toBe(ContentType.Primitive);
        if (node.content.type === ContentType.Primitive) {
            expect(node.content.value.length).toBe(200);
            expect(node.content.value).toEqual(payload);
        }
    });

    test("test_long_form_tag_number", () => {
        const id = new ASN1Identifier(100n, TagClass.ContextSpecific);
        const serializer = new Serializer();
        serializer.appendPrimitiveNode(id, (buf) => {
            buf.push(0x01);
        });
        const bytes = serializer.serializedBytes();

        // Tag class 2 (ContextSpecific) -> 0x80. Long form -> 0x80 | 0x1F = 0x9F.
        // Tag number 100 -> 0x64. Base-128: [0x64]. 
        // Result: 0x9F 0x64 ...
        expect(bytes[0]).toBe(0x9F);
        expect(bytes[1]).toBe(0x64);

        const node = parse(bytes);
        expect(node.identifier.tagNumber).toBe(100n);
        expect(node.identifier.tagClass).toBe(TagClass.ContextSpecific);
    });

    test("test_null_roundtrip", () => {
        const bytes = new Uint8Array([0x05, 0x00]);
        const node = parse(bytes);
        ASN1Null.fromDERNode(node); // should not throw

        const serializer = new Serializer();
        new ASN1Null().serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_octet_string_roundtrip", () => {
        const payload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        const bytes = new Uint8Array([0x04, 0x04, 0xDE, 0xAD, 0xBE, 0xEF]);
        const node = parse(bytes);
        const decoded = ASN1OctetString.fromDERNode(node).value;
        expect(decoded).toEqual(payload);

        const serializer = new Serializer();
        new ASN1OctetString(payload).serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_bit_string_roundtrip", () => {
        // BitString with 3 padding bits: 0xA0 (1010 0000) -> 1010 0 (5 bits)
        const payload = new Uint8Array([0xA0]);
        const bytes = new Uint8Array([0x03, 0x02, 0x03, 0xA0]);
        const node = parse(bytes);
        const bitString = ASN1BitString.fromDERNode(node);
        expect(bitString.bytes).toEqual(payload);
        expect(bitString.paddingBits).toBe(3);

        const serializer = new Serializer();
        bitString.serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);
    });

    test("test_oid_roundtrip", () => {
        // OID: 1.2.840.113549 -> [1, 2, 840, 113549]
        // 1.2 -> 1*40 + 2 = 42 (0x2A)
        // 840 -> 0x86 0x48 (Base-128)
        // 113549 -> 0x86 0xF7 0x0D
        const components = [1n, 2n, 840n, 113549n];
        const bytes = new Uint8Array([0x06, 0x06, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D]);

        const oid = ASN1ObjectIdentifier.fromComponents(components);
        const serializer = new Serializer();
        oid.serialize(serializer);
        expect(serializer.serializedBytes()).toEqual(bytes);

        const node = parse(bytes);
        const decoded = ASN1ObjectIdentifier.fromDERNode(node).components;
        expect(decoded).toEqual(components);
    });

    test("test_real_roundtrip", () => {
        const testValues = [3.14, -0.5, 2.0, Infinity, -Infinity];
        for (const val of testValues) {
            const serializer = new Serializer();
            new ASN1Real(val).serialize(serializer);
            const bytes = serializer.serializedBytes();

            const node = parse(bytes);
            const decoded = ASN1Real.fromDERNode(node).value;
            if (isNaN(val)) {
                expect(isNaN(decoded)).toBe(true);
            } else {
                expect(decoded).toBe(val);
            }
        }
    });

    test("test_binary_utilities", () => {
        const bytes = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
        const hex = "deadbeef";
        const b64 = "3q2+7w==";

        expect(toHex(bytes)).toBe(hex);
        expect(toBase64(bytes)).toBe(b64);
        expect(fromHex(hex)).toEqual(bytes);
        expect(fromBase64(b64)).toEqual(bytes);

        const octetString = new ASN1OctetString(bytes);
        expect(octetString.toHex()).toBe(hex);
        expect(octetString.toBase64()).toBe(b64);
    });
});
