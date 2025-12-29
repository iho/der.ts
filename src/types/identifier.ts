export enum TagClass {
    Universal = 0,
    Application = 1,
    ContextSpecific = 2,
    Private = 3,
}

export class ASN1Identifier {
    constructor(public tagNumber: bigint, public tagClass: TagClass) { }

    static fromTopByte(topByte: number): TagClass {
        return (topByte >> 6) as TagClass;
    }

    topByteFlags(): number {
        return (this.tagClass as number) << 6;
    }

    static fromShortIdentifier(shortIdentifier: number): ASN1Identifier {
        if ((shortIdentifier & 0x1f) === 0x1f) {
            throw new Error("Identifier is not short form");
        }
        return new ASN1Identifier(
            BigInt(shortIdentifier & 0x1f),
            (shortIdentifier >> 6) as TagClass
        );
    }

    shortForm(): number | null {
        if (this.tagNumber < 31n) {
            let baseNumber = Number(this.tagNumber);
            baseNumber |= this.topByteFlags();
            return baseNumber;
        }
        return null;
    }

    toString(): string {
        const classStr = TagClass[this.tagClass];
        const short = this.shortForm();
        if (short !== null) {
            return `ASN1Identifier(tagNumber: ${this.tagNumber}, tagClass: ${classStr}, shortForm: 0x${short
                .toString(16)
                .toUpperCase()
                .padStart(2, "0")})`;
        } else {
            return `ASN1Identifier(tagNumber: ${this.tagNumber}, tagClass: ${classStr}, longForm)`;
        }
    }

    equals(other: ASN1Identifier): boolean {
        return this.tagNumber === other.tagNumber && this.tagClass === other.tagClass;
    }

    // Static constants
    static readonly OBJECT_IDENTIFIER = new ASN1Identifier(6n, TagClass.Universal);
    static readonly BIT_STRING = new ASN1Identifier(3n, TagClass.Universal);
    static readonly OCTET_STRING = new ASN1Identifier(4n, TagClass.Universal);
    static readonly INTEGER = new ASN1Identifier(2n, TagClass.Universal);
    static readonly REAL = new ASN1Identifier(9n, TagClass.Universal);
    static readonly SEQUENCE = new ASN1Identifier(16n, TagClass.Universal);
    static readonly SET = new ASN1Identifier(17n, TagClass.Universal);
    static readonly NULL = new ASN1Identifier(5n, TagClass.Universal);
    static readonly BOOLEAN = new ASN1Identifier(1n, TagClass.Universal);
    static readonly ENUMERATED = new ASN1Identifier(10n, TagClass.Universal);
    static readonly UTF8_STRING = new ASN1Identifier(12n, TagClass.Universal);
    static readonly NUMERIC_STRING = new ASN1Identifier(18n, TagClass.Universal);
    static readonly PRINTABLE_STRING = new ASN1Identifier(19n, TagClass.Universal);
    static readonly TELETEX_STRING = new ASN1Identifier(20n, TagClass.Universal);
    static readonly VIDEOTEX_STRING = new ASN1Identifier(21n, TagClass.Universal);
    static readonly IA5_STRING = new ASN1Identifier(22n, TagClass.Universal);
    static readonly GRAPHIC_STRING = new ASN1Identifier(25n, TagClass.Universal);
    static readonly VISIBLE_STRING = new ASN1Identifier(26n, TagClass.Universal);
    static readonly GENERAL_STRING = new ASN1Identifier(27n, TagClass.Universal);
    static readonly UNIVERSAL_STRING = new ASN1Identifier(28n, TagClass.Universal);
    static readonly BMP_STRING = new ASN1Identifier(30n, TagClass.Universal);
    static readonly GENERALIZED_TIME = new ASN1Identifier(24n, TagClass.Universal);
    static readonly UTC_TIME = new ASN1Identifier(23n, TagClass.Universal);
}
