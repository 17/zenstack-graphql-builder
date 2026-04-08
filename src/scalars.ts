import { Kind, GraphQLScalarType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLID } from 'graphql';
import { Decimal } from 'decimal.js';

export const DateTimeScalar = new GraphQLScalarType({
    name: 'DateTime',
    serialize: (v) => (v instanceof Date ? v.toISOString() : v),
    parseValue: (v) => (v == null ? null : new Date(v as string | number)),
    parseLiteral: (ast) => (ast.kind === Kind.STRING || ast.kind === Kind.INT ? new Date(ast.value) : null),
});

export const JsonScalar = new GraphQLScalarType({
    name: 'Json',
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: JSONScalarParseLiteral,
});

export function JSONScalarParseLiteral(ast: any, variables: any): any {
    switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
            return parseFloat(ast.value);
        case Kind.OBJECT:
            return Object.fromEntries(ast.fields.map((field: any) => [field.name.value, JSONScalarParseLiteral(field.value, variables)]));
        case Kind.LIST:
            return ast.values.map((n: any) => JSONScalarParseLiteral(n, variables));
        case Kind.NULL:
            return null;
        case Kind.VARIABLE: {
            const name = ast.name.value;
            return variables ? variables[name] : undefined;
        }
    }
}

export const BigIntScalar = new GraphQLScalarType({
    name: 'BigInt',
    serialize: (v) => {
        const value = toSafeNumericValue(v);
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    },
    parseValue: toSafeNumericValue,
    parseLiteral: (ast) => (ast.kind === Kind.STRING || ast.kind === Kind.INT ? toSafeNumericValue(ast.value) : null),
});

export function toSafeNumericValue(value: any) {
    if (value == null) return null;
    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) &&
        bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number(bigIntValue);
    }
    return bigIntValue;
}

export const BytesScalar = new GraphQLScalarType({
    name: 'Bytes',
    serialize: (v: any) => Buffer.from(v, hexValidator(v) ? 'hex' : 'base64'),
    parseValue: (v: any) => Buffer.from(v, hexValidator(v) ? 'hex' : 'base64'),
    parseLiteral: (ast) => (ast.kind === Kind.STRING ? Buffer.from(ast.value, hexValidator(ast.value) ? 'hex' : 'base64') : null),
});

export function hexValidator(value: string) {
    const sanitizedValue = value.charAt(0) === '0' ? value.slice(1) : value;
    if (value.length > 8) {
        let parsedString = '';
        for (
            let startIndex = 0, endIndex = 8;
            startIndex < value.length;
            startIndex += 8, endIndex += 8
        ) {
            parsedString += parseInt(value.slice(startIndex, endIndex), 16).toString(16);
        }
        return parsedString === sanitizedValue;
    }
    return parseInt(value, 16).toString(16) === sanitizedValue;
}

export const DecimalScalar = new GraphQLScalarType({
    name: 'Decimal',
    serialize: (v: any) => (v instanceof Decimal ? v.toString() : v?.toString?.()),
    // parseValue: (v) => (v == null ? null : new Decimal(v as Decimal.Value)),
    parseValue: (v) => v,
    parseLiteral: (ast) => (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT ? new Decimal(ast.value) : null),
});

export default {
    String: GraphQLString,
    Int: GraphQLInt,
    Float: GraphQLFloat,
    Boolean: GraphQLBoolean,
    ID: GraphQLID,
    DateTime: DateTimeScalar,
    Json: JsonScalar,
    BigInt: BigIntScalar,
    Bytes: BytesScalar,
    Decimal: DecimalScalar,
    // ...customScalars,
};