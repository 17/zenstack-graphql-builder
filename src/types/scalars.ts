import { Kind, GraphQLScalarType } from 'graphql';
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
    parseLiteral: (ast: any) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.BOOLEAN || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) return ast.value;
        if (ast.kind === Kind.OBJECT) {
            return JSON.parse(ast.loc?.source?.body.slice(ast.loc.start, ast.loc.end) || '{}');
        }
        if (ast.kind === Kind.LIST) return ast.values.map((v: any) => JsonScalar.parseLiteral(v));
        return null;
    },
});

export const BigIntScalar = new GraphQLScalarType({
    name: 'BigInt',
    serialize: (v: any) => (typeof v === 'bigint' ? v.toString() : v?.toString?.()),
    parseValue: (v) => (v == null ? null : BigInt(v as string | number | bigint | boolean)),
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
            try { return BigInt(ast.value); } catch { return null; }
        }
        return null;
    },
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

export const JSONIntScalar = new GraphQLScalarType({
    name: 'JSONInt',
    description: 'The `JSONInt` scalar type represents a signed 53-bit numeric non-fractional value.',
    serialize: (v) => {
        const value = toSafeNumericValue(v);
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    },
    parseValue: toSafeNumericValue,
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
            return toSafeNumericValue(ast.value);
        }
        return null;
    },
});

export const BytesScalar = new GraphQLScalarType({
    name: 'Bytes',
    serialize: (v: any) => {
        if (Buffer.isBuffer(v)) return v.toString('base64');
        if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
        if (typeof v === 'string') return Buffer.from(v, 'base64').toString('base64');
        return null;
    },
    parseValue: (v) => (typeof v === 'string' ? Buffer.from(v, 'base64') : null),
    parseLiteral: (ast) => (ast.kind === Kind.STRING ? Buffer.from(ast.value, 'base64') : null),
});

export const DecimalScalar = new GraphQLScalarType({
    name: 'Decimal',
    serialize: (v: any) => (v instanceof Decimal ? v.toString() : v?.toString?.()),
    parseValue: (v) => (v == null ? null : new Decimal(v as Decimal.Value)),
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
            try { return new Decimal(ast.value); } catch { return null; }
        }
        return null;
    },
});
