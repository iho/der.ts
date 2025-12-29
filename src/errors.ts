export enum ErrorCode {
    InvalidASN1Object = "InvalidASN1Object",
    TruncatedASN1Field = "TruncatedASN1Field",
    UnsupportedFieldLength = "UnsupportedFieldLength",
    UnexpectedFieldType = "UnexpectedFieldType",
    ValueOutOfRange = "ValueOutOfRange",
    MalformedASN1Identifier = "MalformedASN1Identifier",
    InvalidASN1IntegerEncoding = "InvalidASN1IntegerEncoding",
    TooFewOIDComponents = "TooFewOIDComponents",
}

export class ASN1Error extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
        public file?: string,
        public line?: number
    ) {
        super(`[${code}] ${message}${file ? ` (${file}:${line})` : ""}`);
        this.name = "ASN1Error";
    }

    static new(code: ErrorCode, message: string, file?: string, line?: number): ASN1Error {
        return new ASN1Error(code, message, file, line);
    }
}
