import {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLEnumType,
    GraphQLScalarType,
    GraphQLDirective,
    DirectiveLocation,
    specifiedDirectives,
    GraphQLList,
    GraphQLNonNull,
    GraphQLBoolean,
    GraphQLInt,
    GraphQLFloat,
    GraphQLString,
    GraphQLID,
    Kind,
} from 'graphql';
import { Decimal } from 'decimal.js';
import { Buffer } from 'buffer';


/**
 * 定义 @upperCase 指令
 */
export const UpperCaseDirective = new GraphQLDirective({
    name: 'upperCase',
    description: '将字符串字段转换为大写',
    locations: [DirectiveLocation.FIELD],
});

const AllCrudOperations = ["findMany", "findUnique", "findFirst", "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany", "count", "aggregate", "groupBy", "exists", "findUniqueOrThrow", "findFirstOrThrow"];

// ==================== 自定义标量 ====================
const DateTimeScalar = new GraphQLScalarType({
    name: 'DateTime',
    serialize: (v) => (v instanceof Date ? v.toISOString() : v),
    parseValue: (v) => (v == null ? null : new Date(v)),
    parseLiteral: (ast) => (ast.kind === Kind.STRING || ast.kind === Kind.INT ? new Date(ast.value) : null),
});

const JsonScalar = new GraphQLScalarType({
    name: 'Json',
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast, variables) => {
        // if (ast.kind === Kind.STRING) return JSON.parse(ast.value);
        // if (ast.kind === Kind.OBJECT) return valueFromASTUntyped(ast, variables);
        if (ast.kind === Kind.STRING || ast.kind === Kind.BOOLEAN || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) return ast.value;
        if (ast.kind === Kind.OBJECT) {
            return JSON.parse(ast.loc?.source?.body.slice(ast.loc.start, ast.loc.end) || '{}');
        }
        if (ast.kind === Kind.LIST) return ast.values.map((v) => JsonScalar.parseLiteral(v));
        return null;
    },
});

const BigIntScalar = new GraphQLScalarType({
    name: 'BigInt',
    serialize: (v) => (typeof v === 'bigint' ? v.toString() : v?.toString?.()),
    parseValue: (v) => (v == null ? null : BigInt(v)),
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
            try { return BigInt(ast.value); } catch { return null; }
        }
        return null;
    },
});

/**
 * 尝试将 BigInt 转换为安全整数 Number，否则保留 BigInt
 */
function toSafeNumericValue(value) {
    if (value == null) return null;

    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);

    // 检查是否在 JavaScript 安全整数范围内
    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) &&
        bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number(bigIntValue);
    }

    return bigIntValue; // 必须返回，否则不安全时会变成 undefined
}

const JSONIntScalar = new GraphQLScalarType({
    name: 'JSONInt',
    description: 'The `JSONInt` scalar type represents a signed 53-bit numeric non-fractional value. It corresponds to JavaScript `Number.MAX_SAFE_INTEGER`, representing values between -(2^53) and 2^53-1.',
    serialize: (v) => {
        const value = toSafeNumericValue(v);
        // 如果是 BigInt 类型（说明超出了安全范围），转为字符串防止前端精度丢失
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
})


const BytesScalar = new GraphQLScalarType({
    name: 'Bytes',
    serialize: (v) => {
        if (Buffer.isBuffer(v)) return v.toString('base64');
        if (v instanceof Uint8Array) return Buffer.from(v).toString('base64');
        if (typeof v === 'string') return Buffer.from(v, 'base64').toString('base64');
        return null;
    },
    parseValue: (v) => (typeof v === 'string' ? Buffer.from(v, 'base64') : null),
    parseLiteral: (ast) => (ast.kind === Kind.STRING ? Buffer.from(ast.value, 'base64') : null),
});

const DecimalScalar = new GraphQLScalarType({
    name: 'Decimal',
    serialize: (v) => (v instanceof Decimal ? v.toString() : v?.toString?.()),
    parseValue: (v) => (v == null ? null : new Decimal(v)),
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
            try { return new Decimal(ast.value); } catch { return null; }
        }
        return null;
    },
});


// ==================== 基础枚举 ====================
const SortOrderEnum = new GraphQLEnumType({
    name: 'SortOrder',
    values: { asc: { value: 'asc' }, desc: { value: 'desc' } },
});

const NullsOrderEnum = new GraphQLEnumType({
    name: 'NullsOrder',
    values: { first: { value: 'first' }, last: { value: 'last' } },
});

const QueryModeEnum = new GraphQLEnumType({
    name: 'QueryMode',
    values: { default: { value: 'default' }, insensitive: { value: 'insensitive' } },
});

// ==================== 主生成器类 ====================
export class ZenStackGraphQLBuilder {
    constructor({ schema, options, directives, directiveDefinitions, operations, scalars }) {
        this.zenSchema = schema; // ZenStack SchemaDef
        this.modelNames = Object.keys(schema.models);
        this.outputSchema = null;
        this.outpuRootValue = null
        this.options = {
            maxDepth: 9,
            maxTake: 100,
            throwOnError: false,
            useJSONIntScalar: false,
            ...options
        };
        this.directives = directives || []
        this.directiveDefinitions = directiveDefinitions || []
        this.operations = operations || AllCrudOperations

        // 初始化标量映射
        this.scalarRegistry = this._initializeScalars(scalars);

        // 统一类型缓存，键为类型完整名称
        this.typeMap = new Map();

        // 构建枚举并放入缓存
        this._buildEnums();
        this._buildSchema();
        this._buildRootValue();
    }

    getSchema() {
        return this.outputSchema;
    }
    getRootResolver() {
        return this.outpuRootValue;
    }

    _initializeScalars(scalars = {}) {
        const newScalars = {
            String: GraphQLString,
            Int: this.options.useJSONIntScalar ? JSONIntScalar : GraphQLInt,
            Float: GraphQLFloat,
            Boolean: GraphQLBoolean,
            ID: GraphQLID,
            DateTime: DateTimeScalar,
            Json: JsonScalar,
            BigInt: BigIntScalar,
            Bytes: BytesScalar,
            Decimal: DecimalScalar,
            ...scalars
        };
        return newScalars;
    }

    // 生成最终的 GraphQLSchema
    _buildSchema() {
        // ---------- 预先生成所有类型并存入缓存 ----------
        for (const model of this.modelNames) {
            // 这些方法内部会递归生成所有依赖的类型，并存入 typeMap
            this._getOutputType(model);
            this._getWhereInput(model);
            this._getOrderByInput(model);
            this._getCreateInput(model);
            this._getUpdateInput(model);
            this._getWhereUniqueInput(model);
            this._getCreateManyInput(model);
            this._getCountAggOutput(model);
            this._getDistinctEnum(model);
            this._getOmitInput(model);
            this._getCountAggInput(model);
            this._getAggInput(model);
            this._getConnectOrCreateInput(model);
            this._getUpdateNestedInput(model);
            this._getUpdateManyNestedInput(model);
            this._getUpsertNestedInput(model);
        }
        this._getAffectedRowsOutput(); // 确保 AffectedRowsOutput 也被缓存

        const queryFields = {};
        const mutationFields = {};

        for (const model of this.modelNames) {
            const lower = model[0].toLowerCase() + model.slice(1);

            // ---------- 查询字段 ----------
            queryFields[`${lower}_findUnique`] = {
                type: this.typeMap.get(model),
                args: {
                    where: { type: new GraphQLNonNull(this.typeMap.get(`${model}WhereUniqueInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            queryFields[`${lower}_findUniqueOrThrow`] = {
                type: new GraphQLNonNull(this.typeMap.get(model)),
                args: {
                    where: { type: new GraphQLNonNull(this.typeMap.get(`${model}WhereUniqueInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            queryFields[`${lower}_findFirst`] = {
                type: this.typeMap.get(model),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}OrderByInput`))) },
                    cursor: { type: this.typeMap.get(`${model}WhereUniqueInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}DistinctFieldEnum`))) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            queryFields[`${lower}_findFirstOrThrow`] = {
                type: new GraphQLNonNull(this.typeMap.get(model)),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}OrderByInput`))) },
                    cursor: { type: this.typeMap.get(`${model}WhereUniqueInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}DistinctFieldEnum`))) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            queryFields[`${lower}_findMany`] = {
                type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(model))),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}OrderByInput`))) },
                    cursor: { type: this.typeMap.get(`${model}WhereUniqueInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}DistinctFieldEnum`))) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            queryFields[`${lower}_count`] = {
                type: this.typeMap.get(`${model}CountAggregateOutput`),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}OrderByInput`))) },
                    cursor: { type: this.typeMap.get(`${model}WhereUniqueInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                },
            };
            queryFields[`${lower}_aggregate`] = {
                type: new GraphQLNonNull(JsonScalar),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}OrderByInput`))) },
                    cursor: { type: this.typeMap.get(`${model}WhereUniqueInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    _count: { type: this.typeMap.get(`${model}CountAggregateInput`) },
                    _avg: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _sum: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _min: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _max: { type: this.typeMap.get(`${model}AggregateInput`) },
                },
            };
            queryFields[`${lower}_groupBy`] = {
                type: new GraphQLList(new GraphQLNonNull(JsonScalar)),
                args: {
                    by: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}DistinctFieldEnum`)))) },
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    having: { type: this.typeMap.get(`${model}WhereInput`) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    _count: { type: this.typeMap.get(`${model}CountAggregateInput`) },
                    _avg: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _sum: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _min: { type: this.typeMap.get(`${model}AggregateInput`) },
                    _max: { type: this.typeMap.get(`${model}AggregateInput`) },
                },
            };
            queryFields[`${lower}_exists`] = {
                type: new GraphQLNonNull(GraphQLBoolean),
                args: { where: { type: this.typeMap.get(`${model}WhereInput`) } },
            };

            // ---------- 变更字段 ----------
            mutationFields[`${lower}_create`] = {
                type: new GraphQLNonNull(this.typeMap.get(model)),
                args: {
                    data: { type: new GraphQLNonNull(this.typeMap.get(`${model}CreateInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_createMany`] = {
                type: this.typeMap.get('affectedRowsOutput'),
                args: {
                    data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}CreateManyInput`)))) },
                    skipDuplicates: { type: GraphQLBoolean },
                },
            };
            mutationFields[`${lower}_createManyAndReturn`] = {
                type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(model))),
                args: {
                    data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.typeMap.get(`${model}CreateManyInput`)))) },
                    skipDuplicates: { type: GraphQLBoolean },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_update`] = {
                type: this.typeMap.get(model),
                args: {
                    where: { type: new GraphQLNonNull(this.typeMap.get(`${model}WhereUniqueInput`)) },
                    data: { type: new GraphQLNonNull(this.typeMap.get(`${model}UpdateInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_updateMany`] = {
                type: this.typeMap.get('affectedRowsOutput'),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    data: { type: new GraphQLNonNull(this.typeMap.get(`${model}UpdateInput`)) },
                    limit: { type: GraphQLInt },
                },
            };
            mutationFields[`${lower}_updateManyAndReturn`] = {
                type: new GraphQLList(new GraphQLNonNull(this.typeMap.get(model))),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    data: { type: new GraphQLNonNull(this.typeMap.get(`${model}UpdateInput`)) },
                    limit: { type: GraphQLInt },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_upsert`] = {
                type: new GraphQLNonNull(this.typeMap.get(model)),
                args: {
                    where: { type: new GraphQLNonNull(this.typeMap.get(`${model}WhereUniqueInput`)) },
                    create: { type: new GraphQLNonNull(this.typeMap.get(`${model}CreateInput`)) },
                    update: { type: new GraphQLNonNull(this.typeMap.get(`${model}UpdateInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_delete`] = {
                type: this.typeMap.get(model),
                args: {
                    where: { type: new GraphQLNonNull(this.typeMap.get(`${model}WhereUniqueInput`)) },
                    omit: { type: this.typeMap.get(`${model}OmitInput`) },
                },
            };
            mutationFields[`${lower}_deleteMany`] = {
                type: this.typeMap.get('affectedRowsOutput'),
                args: {
                    where: { type: this.typeMap.get(`${model}WhereInput`) },
                    limit: { type: GraphQLInt },
                },
            };
        }

        const queryType = new GraphQLObjectType({ name: 'Query', fields: queryFields });
        const mutationType = new GraphQLObjectType({ name: 'Mutation', fields: mutationFields });

        // 收集所有已缓存类型（排除基础标量和枚举，它们已手动加入）
        const allTypes = Array.from(this.typeMap.values());

        this.outputSchema = new GraphQLSchema({
            query: queryType,
            mutation: mutationType,
            directives: [...specifiedDirectives, ...this.directiveDefinitions],
            types: [
                ...allTypes,
                SortOrderEnum,
                NullsOrderEnum,
                QueryModeEnum,
                DateTimeScalar,
                JsonScalar,
                BigIntScalar,
                BytesScalar,
                DecimalScalar,
            ],
        });

        // return new GraphQLSchema({
        //     query: queryType,
        //     mutation: mutationType,
        //     directives: [...specifiedDirectives, ...customDirectives],
        //     types: [
        //         ...allTypes,
        //         SortOrderEnum,
        //         NullsOrderEnum,
        //         QueryModeEnum,
        //         DateTimeScalar,
        //         JsonScalar,
        //         BigIntScalar,
        //         BytesScalar,
        //         DecimalScalar,
        //     ],
        // });
    }

    // ---------- 构建枚举 ----------
    _buildEnums() {
        if (!this.zenSchema.enums) return;
        for (const [name, def] of Object.entries(this.zenSchema.enums)) {
            const values = Object.keys(def).reduce((acc, key) => ({ ...acc, [key]: { value: key } }), {});
            const enumType = new GraphQLEnumType({ name, values });
            this.typeMap.set(name, enumType);
        }
    }

    // ---------- 辅助：获取模型定义并检查 ----------
    _getModelDef(model) {
        const def = this.zenSchema.models[model];
        if (!def) throw new Error(`Model "${model}" not found`);
        if (!def.fields || typeof def.fields !== 'object') {
            throw new Error(`Model "${model}" has no valid fields`);
        }
        return def;
    }

    // ---------- 辅助：字段是否为标量 ----------
    _isScalar(field) {
        return !field.relation && !field.foreignKeyFor;
    }

    // ---------- 辅助：字段是否为关系 ----------
    _isRelation(field) {
        return !!field.relation;
    }

    // ---------- 辅助：获取目标模型名 ----------
    _getTargetModel(field) {
        return field.type; // 关系字段的 type 就是目标模型名
    }

    // ---------- 辅助：是否为自增 ----------
    _isAutoIncrement(field) {
        return field.default?.name === 'autoincrement';
    }

    // ---------- 辅助：将字段类型转换为 GraphQL 类型 ----------
    _fieldToGraphQLType(field) {
        let base;
        if (this.typeMap.has(field.type)) {
            base = this.typeMap.get(field.type);
        } else if (this.scalarRegistry[field.type]) {
            base = this.scalarRegistry[field.type];
        } else {
            base = GraphQLString; // 回退
        }

        let type = base;
        if (field.array) {
            type = new GraphQLList(new GraphQLNonNull(base));
        }
        if (!field.optional) {
            type = new GraphQLNonNull(type);
        }
        return type;
    }

    // ---------- 标量过滤器工厂（使用 typeMap）----------
    _getFilter(typeName) {
        const name = `${typeName}Filter`;
        // 如果已经存在，直接返回
        const cached = this.typeMap.get(name);
        if (cached) return cached;

        // 如果是枚举，创建枚举过滤器
        if (this.typeMap.has(typeName) && this.typeMap.get(typeName) instanceof GraphQLEnumType) {
            const enumType = this.typeMap.get(typeName);
            return this._createEnumFilter(enumType);
        }

        let filter;
        switch (typeName) {
            case 'String': filter = this._createStringFilter(); break;
            case 'Int':
            case 'Float': filter = this._createNumberFilter(typeName); break;
            case 'Boolean': filter = this._createBooleanFilter(); break;
            case 'DateTime': filter = this._createDateTimeFilter(); break;
            case 'BigInt': filter = this._createBigIntFilter(); break;
            case 'Decimal': filter = this._createDecimalFilter(); break;
            case 'Bytes': filter = this._createBytesFilter(); break;
            case 'Json': filter = this._createJsonFilter(); break;
            default: return null;
        }

        this.typeMap.set(name, filter);
        return filter;
    }

    _createStringFilter() {
        const name = 'StringFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: GraphQLString },
                in: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
                lt: { type: GraphQLString },
                lte: { type: GraphQLString },
                gt: { type: GraphQLString },
                gte: { type: GraphQLString },
                contains: { type: GraphQLString },
                startsWith: { type: GraphQLString },
                endsWith: { type: GraphQLString },
                mode: { type: QueryModeEnum },
                not: { type: this._getFilter('String') },
                _count: { type: this._getFilter('Int') },
                _min: { type: this._getFilter('String') },
                _max: { type: this._getFilter('String') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createNumberFilter(typeName) {
        const name = typeName === 'Int' ? 'IntFilter' : typeName === 'Float' ? 'FloatFilter' : 'NumberFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const baseType = this.scalarRegistry[typeName] || GraphQLInt;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: baseType },
                in: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                lt: { type: baseType },
                lte: { type: baseType },
                gt: { type: baseType },
                gte: { type: baseType },
                between: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                not: { type: this._getFilter(typeName) },
                _count: { type: this._getFilter('Int') },
                _avg: { type: this._getFilter(typeName) },
                _sum: { type: this._getFilter(typeName) },
                _min: { type: this._getFilter(typeName) },
                _max: { type: this._getFilter(typeName) },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createBooleanFilter() {
        const name = 'BooleanFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: GraphQLBoolean },
                not: { type: this._getFilter('Boolean') },
                _count: { type: this._getFilter('Int') },
                _min: { type: this._getFilter('Boolean') },
                _max: { type: this._getFilter('Boolean') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createDateTimeFilter() {
        const name = 'DateTimeFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: DateTimeScalar },
                in: { type: new GraphQLList(new GraphQLNonNull(DateTimeScalar)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(DateTimeScalar)) },
                lt: { type: DateTimeScalar },
                lte: { type: DateTimeScalar },
                gt: { type: DateTimeScalar },
                gte: { type: DateTimeScalar },
                between: { type: new GraphQLList(new GraphQLNonNull(DateTimeScalar)) },
                not: { type: this._getFilter('DateTime') },
                _count: { type: this._getFilter('Int') },
                _min: { type: this._getFilter('DateTime') },
                _max: { type: this._getFilter('DateTime') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createBigIntFilter() {
        const name = 'BigIntFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: BigIntScalar },
                in: { type: new GraphQLList(new GraphQLNonNull(BigIntScalar)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(BigIntScalar)) },
                lt: { type: BigIntScalar },
                lte: { type: BigIntScalar },
                gt: { type: BigIntScalar },
                gte: { type: BigIntScalar },
                between: { type: new GraphQLList(new GraphQLNonNull(BigIntScalar)) },
                not: { type: this._getFilter('BigInt') },
                _count: { type: this._getFilter('Int') },
                _avg: { type: this._getFilter('BigInt') },
                _sum: { type: this._getFilter('BigInt') },
                _min: { type: this._getFilter('BigInt') },
                _max: { type: this._getFilter('BigInt') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createDecimalFilter() {
        const name = 'DecimalFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: DecimalScalar },
                in: { type: new GraphQLList(new GraphQLNonNull(DecimalScalar)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(DecimalScalar)) },
                lt: { type: DecimalScalar },
                lte: { type: DecimalScalar },
                gt: { type: DecimalScalar },
                gte: { type: DecimalScalar },
                between: { type: new GraphQLList(new GraphQLNonNull(DecimalScalar)) },
                not: { type: this._getFilter('Decimal') },
                _count: { type: this._getFilter('Int') },
                _avg: { type: this._getFilter('Decimal') },
                _sum: { type: this._getFilter('Decimal') },
                _min: { type: this._getFilter('Decimal') },
                _max: { type: this._getFilter('Decimal') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createBytesFilter() {
        const name = 'BytesFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: BytesScalar },
                in: { type: new GraphQLList(new GraphQLNonNull(BytesScalar)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(BytesScalar)) },
                not: { type: this._getFilter('Bytes') },
                _count: { type: this._getFilter('Int') },
                _min: { type: this._getFilter('Bytes') },
                _max: { type: this._getFilter('Bytes') },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createJsonFilter() {
        const name = 'JsonFilter';
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: JsonScalar },
                not: { type: JsonScalar },
                path: { type: GraphQLString },
                string_contains: { type: GraphQLString },
                string_starts_with: { type: GraphQLString },
                string_ends_with: { type: GraphQLString },
                mode: { type: QueryModeEnum },
                array_contains: { type: JsonScalar },
                array_starts_with: { type: JsonScalar },
                array_ends_with: { type: JsonScalar },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    _createEnumFilter(enumType) {
        const name = `${enumType.name}Filter`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;
        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: enumType },
                in: { type: new GraphQLList(new GraphQLNonNull(enumType)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(enumType)) },
                not: { type: this._getFilter(enumType.name) },
                _count: { type: this._getFilter('Int') },
                _min: { type: this._getFilter(enumType.name) },
                _max: { type: this._getFilter(enumType.name) },
            }),
        });
        this.typeMap.set(name, filter);
        return filter;
    }

    // ---------- 类型获取方法（统一使用 typeMap）----------
    _getOutputType(model) {
        const name = model;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const type = new GraphQLObjectType({
            name,
            fields: () => {
                const fields = {};
                const toManyRelations = []; // 收集所有一对多/多对多关系

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    // 标量字段
                    if (this._isScalar(field)) {
                        fields[fieldName] = { type: this._fieldToGraphQLType(field) };
                    }
                    // 关系字段
                    if (this._isRelation(field)) {
                        const target = this._getTargetModel(field);
                        const targetType = this._getOutputType(target);

                        const fieldConfig = {
                            type: field.array
                                ? new GraphQLList(new GraphQLNonNull(targetType))
                                : field.optional ? targetType : new GraphQLNonNull(targetType),
                        };

                        // 如果是一对多/多对多关系（array=true），添加过滤参数
                        if (field.array) {
                            toManyRelations.push({ fieldName, field });
                            const args = {};
                            args.where = { type: this._getWhereInput(target) };
                            args.orderBy = { type: new GraphQLList(this._getOrderByInput(target)) };
                            args.take = { type: GraphQLInt };
                            args.skip = { type: GraphQLInt };
                            args.cursor = { type: this._getWhereUniqueInput(target) };
                            args.distinct = { type: new GraphQLList(new GraphQLNonNull(this._getDistinctEnum(target))) };
                            fieldConfig.args = args;
                        }

                        fields[fieldName] = fieldConfig;
                    }
                }

                // _count 字段：基于 toManyRelations 构建，并为每个子字段添加参数
                if (toManyRelations.length) {
                    const countTypeName = `${model}_count`;
                    let countType = this.typeMap.get(countTypeName);
                    if (!countType) {
                        const countFields = {};
                        toManyRelations.forEach(({ fieldName, field }) => {
                            const target = this._getTargetModel(field);
                            // 为每个计数子字段添加与数组关系相同的参数
                            const args = {
                                // where: { type: this._getWhereInput(target) },
                                // orderBy: { type: new GraphQLList(this._getOrderByInput(target)) },
                                // take: { type: GraphQLInt },
                                // skip: { type: GraphQLInt },
                                // cursor: { type: this._getWhereUniqueInput(target) },
                                // distinct: { type: new GraphQLList(new GraphQLNonNull(this._getDistinctEnum(target))) },
                            };
                            countFields[fieldName] = {
                                type: GraphQLInt,
                                args: args,
                            };
                        });
                        countType = new GraphQLObjectType({
                            name: countTypeName,
                            fields: countFields,
                        });
                        this.typeMap.set(countTypeName, countType);
                    }
                    fields._count = { type: countType };
                }

                return fields;
            },
        });

        this.typeMap.set(name, type);
        return type;
    }

    _getWhereInput(model) {
        const name = `${model}WhereInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        let whereInput; // 用于自引用
        whereInput = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields = {
                    AND: { type: new GraphQLList(whereInput) },
                    OR: { type: new GraphQLList(whereInput) },
                    NOT: { type: new GraphQLList(whereInput) },
                };

                // 标量过滤
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isScalar(field)) {
                        const filter = this._getFilter(field.type);
                        if (filter) fields[fieldName] = { type: filter };
                    }
                }

                // 关系过滤
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isRelation(field)) {
                        const target = this._getTargetModel(field);
                        const targetWhere = this._getWhereInput(target);
                        const filterName = `${model}${fieldName}RelationFilter`;
                        let filter = this.typeMap.get(filterName);
                        if (!filter) {
                            filter = new GraphQLInputObjectType({
                                name: filterName,
                                fields: field.array
                                    ? {
                                        every: { type: targetWhere },
                                        some: { type: targetWhere },
                                        none: { type: targetWhere },
                                    }
                                    : {
                                        is: { type: targetWhere },
                                        isNot: { type: targetWhere },
                                    },
                            });
                            this.typeMap.set(filterName, filter);
                        }
                        fields[fieldName] = { type: filter };
                    }
                }
                return fields;
            },
        });

        this.typeMap.set(name, whereInput);
        return whereInput;
    }

    _getWhereUniqueInput(model) {
        const name = `${model}WhereUniqueInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = {};
        for (const idField of modelDef.idFields) {
            const field = modelDef.fields[idField];
            if (!field) throw new Error(`ID field ${idField} not found in ${model}`);
            fields[idField] = { type: this._fieldToGraphQLType(field) };
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeMap.set(name, input);
        return input;
    }

    _getOrderByInput(model) {
        const name = `${model}OrderByInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const orderBy = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields = {};

                // 标量排序
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isScalar(field)) {
                        fields[fieldName] = { type: SortOrderEnum };
                    }
                }

                // 关系排序
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isRelation(field)) {
                        const target = this._getTargetModel(field);
                        if (field.array) {
                            const aggName = `${model}${fieldName}OrderByRelationAggregateInput`;
                            let aggType = this.typeMap.get(aggName);
                            if (!aggType) {
                                aggType = new GraphQLInputObjectType({
                                    name: aggName,
                                    fields: { _count: { type: SortOrderEnum } },
                                });
                                this.typeMap.set(aggName, aggType);
                            }
                            fields[fieldName] = { type: aggType };
                        } else {
                            fields[fieldName] = { type: this._getOrderByInput(target) };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeMap.set(name, orderBy);
        return orderBy;
    }

    _getCreateInput(model) {
        const name = `${model}CreateInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const create = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields = {};

                // 标量字段（排除自增）
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isScalar(field) && !this._isAutoIncrement(field)) {
                        fields[fieldName] = { type: this._fieldToGraphQLType(field) };
                    }
                }

                // 关系创建
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isRelation(field)) {
                        const target = this._getTargetModel(field);
                        const targetCreate = this._getCreateInput(target);
                        const targetWhereUnique = this._getWhereUniqueInput(target);
                        const targetCreateMany = this._getCreateManyInput(target);
                        const targetConnectOrCreate = this._getConnectOrCreateInput(target);

                        if (field.array) {
                            const nestedName = `${model}${fieldName}CreateNestedManyInput`;
                            let nestedType = this.typeMap.get(nestedName);
                            if (!nestedType) {
                                nestedType = new GraphQLInputObjectType({
                                    name: nestedName,
                                    fields: {
                                        create: { type: new GraphQLList(new GraphQLNonNull(targetCreate)) },
                                        connect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        connectOrCreate: { type: new GraphQLList(new GraphQLNonNull(targetConnectOrCreate)) },
                                        createMany: { type: targetCreateMany },
                                    },
                                });
                                this.typeMap.set(nestedName, nestedType);
                            }
                            fields[fieldName] = { type: nestedType };
                        } else {
                            const nestedName = `${model}${fieldName}CreateNestedOneInput`;
                            let nestedType = this.typeMap.get(nestedName);
                            if (!nestedType) {
                                nestedType = new GraphQLInputObjectType({
                                    name: nestedName,
                                    fields: {
                                        create: { type: targetCreate },
                                        connect: { type: targetWhereUnique },
                                        connectOrCreate: { type: targetConnectOrCreate },
                                    },
                                });
                                this.typeMap.set(nestedName, nestedType);
                            }
                            fields[fieldName] = { type: nestedType };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeMap.set(name, create);
        return create;
    }

    _getUpdateInput(model) {
        const name = `${model}UpdateInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const update = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields = {};

                // 标量更新
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isScalar(field)) {
                        const baseType = this._fieldToGraphQLType(field);
                        const numeric = ['Int', 'Float', 'BigInt', 'Decimal'].includes(field.type);
                        if (numeric && !field.array) {
                            const opName = `${model}${fieldName}UpdateNumberInput`;
                            let opType = this.typeMap.get(opName);
                            if (!opType) {
                                opType = new GraphQLInputObjectType({
                                    name: opName,
                                    fields: {
                                        set: { type: baseType },
                                        increment: { type: baseType },
                                        decrement: { type: baseType },
                                        multiply: { type: baseType },
                                        divide: { type: baseType },
                                    },
                                });
                                this.typeMap.set(opName, opType);
                            }
                            fields[fieldName] = { type: opType };
                        } else if (field.array) {
                            const arrName = `${model}${fieldName}UpdateArrayInput`;
                            let arrType = this.typeMap.get(arrName);
                            if (!arrType) {
                                arrType = new GraphQLInputObjectType({
                                    name: arrName,
                                    fields: {
                                        set: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                                        push: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                                    },
                                });
                                this.typeMap.set(arrName, arrType);
                            }
                            fields[fieldName] = { type: arrType };
                        } else {
                            const scalarName = `${model}${fieldName}UpdateScalarInput`;
                            let scalarType = this.typeMap.get(scalarName);
                            if (!scalarType) {
                                scalarType = new GraphQLInputObjectType({
                                    name: scalarName,
                                    fields: { set: { type: baseType } },
                                });
                                this.typeMap.set(scalarName, scalarType);
                            }
                            fields[fieldName] = { type: scalarType };
                        }
                    }
                }

                // 关系更新
                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this._isRelation(field)) {
                        const target = this._getTargetModel(field);
                        const targetCreate = this._getCreateInput(target);
                        const targetWhereUnique = this._getWhereUniqueInput(target);
                        const targetConnectOrCreate = this._getConnectOrCreateInput(target);
                        const targetUpdate = this._getUpdateInput(target);
                        const targetWhere = this._getWhereInput(target);
                        const targetUpdateNested = this._getUpdateNestedInput(target);
                        const targetUpdateManyNested = this._getUpdateManyNestedInput(target);
                        const targetUpsertNested = this._getUpsertNestedInput(target);

                        if (field.array) {
                            const relName = `${model}${fieldName}UpdateManyRelationInput`;
                            let relType = this.typeMap.get(relName);
                            if (!relType) {
                                relType = new GraphQLInputObjectType({
                                    name: relName,
                                    fields: {
                                        create: { type: new GraphQLList(new GraphQLNonNull(targetCreate)) },
                                        connect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        connectOrCreate: { type: new GraphQLList(new GraphQLNonNull(targetConnectOrCreate)) },
                                        disconnect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        delete: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        update: { type: new GraphQLList(new GraphQLNonNull(targetUpdateNested)) },
                                        updateMany: { type: new GraphQLList(new GraphQLNonNull(targetUpdateManyNested)) },
                                        deleteMany: { type: new GraphQLList(new GraphQLNonNull(targetWhere)) },
                                        set: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                    },
                                });
                                this.typeMap.set(relName, relType);
                            }
                            fields[fieldName] = { type: relType };
                        } else {
                            const relName = `${model}${fieldName}UpdateOneRelationInput`;
                            let relType = this.typeMap.get(relName);
                            if (!relType) {
                                relType = new GraphQLInputObjectType({
                                    name: relName,
                                    fields: {
                                        create: { type: targetCreate },
                                        connect: { type: targetWhereUnique },
                                        connectOrCreate: { type: targetConnectOrCreate },
                                        disconnect: { type: GraphQLBoolean },
                                        delete: { type: GraphQLBoolean },
                                        update: { type: targetUpdate },
                                        upsert: { type: targetUpsertNested },
                                    },
                                });
                                this.typeMap.set(relName, relType);
                            }
                            fields[fieldName] = { type: relType };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeMap.set(name, update);
        return update;
    }

    _getCreateManyInput(model) {
        const name = `${model}CreateManyInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field) && !this._isAutoIncrement(field)) {
                fields[fieldName] = { type: this._fieldToGraphQLType(field) };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeMap.set(name, input);
        return input;
    }

    _getCountAggOutput(model) {
        const name = `${model}CountAggregateOutput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = { _all: { type: GraphQLInt } };
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field)) {
                fields[fieldName] = { type: GraphQLInt };
            }
        }

        const output = new GraphQLObjectType({ name, fields });
        this.typeMap.set(name, output);
        return output;
    }

    _getDistinctEnum(model) {
        const name = `${model}DistinctFieldEnum`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const values = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field)) {
                values[fieldName] = { value: fieldName };
            }
        }

        const enumType = new GraphQLEnumType({ name, values });
        this.typeMap.set(name, enumType);
        return enumType;
    }

    _getOmitInput(model) {
        const name = `${model}OmitInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeMap.set(name, input);
        return input;
    }

    _getCountAggInput(model) {
        const name = `${model}CountAggregateInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = { _all: { type: GraphQLBoolean } };
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeMap.set(name, input);
        return input;
    }

    _getAggInput(model) {
        const name = `${model}AggregateInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const modelDef = this._getModelDef(model);
        const fields = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this._isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeMap.set(name, input);
        return input;
    }

    _getConnectOrCreateInput(model) {
        const name = `${model}ConnectOrCreateInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: {
                where: { type: new GraphQLNonNull(this._getWhereUniqueInput(model)) },
                create: { type: new GraphQLNonNull(this._getCreateInput(model)) },
            },
        });
        this.typeMap.set(name, input);
        return input;
    }

    _getUpdateNestedInput(model) {
        const name = `${model}UpdateNestedInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: {
                where: { type: new GraphQLNonNull(this._getWhereUniqueInput(model)) },
                data: { type: new GraphQLNonNull(this._getUpdateInput(model)) },
            },
        });
        this.typeMap.set(name, input);
        return input;
    }

    _getUpdateManyNestedInput(model) {
        const name = `${model}UpdateManyNestedInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: {
                where: { type: this._getWhereInput(model) },
                data: { type: new GraphQLNonNull(this._getUpdateInput(model)) },
                limit: { type: GraphQLInt },
            },
        });
        this.typeMap.set(name, input);
        return input;
    }

    _getUpsertNestedInput(model) {
        const name = `${model}UpsertNestedInput`;
        const existing = this.typeMap.get(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: {
                where: { type: new GraphQLNonNull(this._getWhereUniqueInput(model)) },
                create: { type: new GraphQLNonNull(this._getCreateInput(model)) },
                update: { type: new GraphQLNonNull(this._getUpdateInput(model)) },
            },
        });
        this.typeMap.set(name, input);
        return input;
    }

    _getAffectedRowsOutput() {
        const name = 'affectedRowsOutput';
        const payload = new GraphQLObjectType({
            name,
            fields: { count: { type: new GraphQLNonNull(GraphQLInt) } },
        });
        this.typeMap.set(name, payload);
        return payload;
    }

    applySecurityRules(key, value) {
        const quantityKeys = ['take', 'first', 'last', 'limit'];
        if (quantityKeys.includes(key) && typeof value === 'number') {
            if (value > this.options.maxTake) {
                if (this.options.throwOnError) {
                    throw new Error(`[Security Violation] '${key}' exceeds max limit of ${this.options.maxTake}`);
                }
                return this.options.maxTake;
            }
        }
        return value;
    }

    /**
     * 校验并清理参数对象
     */
    validateArguments(argsObject) {
        //   const policy = { ...DEFAULT_SECURITY_POLICY, ...options };
        const sanitized = {};
        for (const [key, val] of Object.entries(argsObject || {})) {
            sanitized[key] = this.applySecurityRules(key, val);
        }
        return sanitized;
    }

    /**
     * 解析 AST 节点参数（包括指令参数）
     */
    getArgsFromAST(nodes, variables) {
        if (!nodes || nodes.length === 0) return null;
        const args = {};
        for (const node of nodes) {
            args[node.name.value] = valueFromASTUntyped(node.value, variables);
        }
        return args;
    }


    /**
     * 解析 GraphQL ResolveInfo 转换为 Prisma Select 和 指令转换计划
     */
    parseGraphQLProjection(info, options = {}) {
        const policy = { ...this.options, ...options };
        const { fieldNodes, fragments, variableValues } = info;

        return this.traverseASTNode(fieldNodes[0].selectionSet, fragments, variableValues, policy, 0);
    }

    traverseASTNode(selectionSet, fragments, variables, policy, depth) {

        if (depth >= policy.maxDepth) {
            if (policy.throwOnError) {
                throw new Error(`[Security Violation] Query depth limit reached (${policy.maxDepth})`);
            }
            return { prismaSelect: undefined, transformPlan: null };
        }

        const prismaSelect = {};
        const transformPlan = {}; // 仅存储包含指令的字段路径
        let hasDirectivesInTree = false;

        if (!selectionSet) return { prismaSelect: undefined, transformPlan: null };

        for (const selection of selectionSet.selections) {
            // 1. 处理片段 (Fragments)
            if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
                const fragment = selection.kind === 'FragmentSpread' ? fragments[selection.name.value] : selection;
                if (fragment) {
                    const result = this.traverseASTNode(fragment.selectionSet, fragments, variables, policy, depth);
                    Object.assign(prismaSelect, result.prismaSelect);
                    if (result.transformPlan) {
                        Object.assign(transformPlan, result.transformPlan);
                        hasDirectivesInTree = true;
                    }
                }
                continue;
            }

            // 2. 处理标准字段
            if (selection.kind === 'Field') {
                const fieldName = selection.name.value;

                // 解析字段参数 (e.g. users(take: 10))
                const args = this.getArgsFromAST(selection.arguments, variables);
                const validatedArgs = this.validateArguments(args, policy);

                // 解析指令及其参数 (e.g. @mask(start: 3))
                const directiveConfigs = selection.directives?.map(d => ({
                    name: d.name.value,
                    args: this.getArgsFromAST(d.arguments, variables)
                })) || [];

                if (selection.selectionSet) {
                    // 递归处理嵌套
                    const subResult = this.traverseASTNode(selection.selectionSet, fragments, variables, policy, depth + 1);

                    prismaSelect[fieldName] = {
                        select: subResult.prismaSelect,
                        ...validatedArgs
                    };

                    // 只有当子节点有指令或当前节点有指令时，才记录到 Plan
                    if (directiveConfigs.length > 0 || subResult.transformPlan) {
                        transformPlan[fieldName] = {
                            directives: directiveConfigs.length > 0 ? directiveConfigs : null,
                            nested: subResult.transformPlan
                        };
                        hasDirectivesInTree = true;
                    }
                } else {
                    // 叶子节点
                    prismaSelect[fieldName] = true;
                    if (directiveConfigs.length > 0) {
                        transformPlan[fieldName] = { directives: directiveConfigs };
                        hasDirectivesInTree = true;
                    }
                }
            }
        }

        return {
            prismaSelect,
            transformPlan: hasDirectivesInTree ? transformPlan : null
        };
    }

    // ==========================================
    // 3. 结果映射模块 (支持异步指令)
    // ==========================================

    /**
     * 递归应用指令转换
     * @param {Object|Array} data - Prisma 返回的数据
     * @param {Object} plan - transformPlan
     */
    async applyDirectives(data, plan, vars) {
        // 如果数据为空或没有转换计划，直接返回
        if (!data || !plan) return data;

        // 处理数组性能优化：使用 Promise.all 并行处理
        if (Array.isArray(data)) {
            return Promise.all(data.map(item => this.applyDirectives(item, plan)));
        }

        // 浅拷贝对象以避免副作用，仅处理 plan 中存在的字段
        const result = { ...data };

        for (const fieldName in plan) {
            const { directives, nested } = plan[fieldName];
            let value = result[fieldName];

            if (value === undefined) continue;

            // 1. 先处理嵌套数据
            if (nested && value !== null) {
                value = await this.applyDirectives(value, nested);
            }

            // 2. 顺序执行当前字段的所有指令
            if (directives) {
                for (const dir of directives) {
                    const handler = this.directives[dir.name];
                    if (handler) {
                        value = await handler(value, dir.args || {}, vars, fieldName);
                    }
                }
            }

            result[fieldName] = value;
        }

        return result;
    }


    /**
     * 静态生成 rootValue 结构
     * 此时它不依赖具体的 prisma 实例，只定义逻辑骨架
     */
    _buildRootValue() {
        this.outpuRootValue = this.modelNames.reduce((acc, model) => {
            const lower = model[0].toLowerCase() + model.slice(1);
            for (const operation of this.operations) {
                acc[`${lower}_${operation}`] = async (args, contextValue, info) => {
                    // console.log(info.variableValues)
                    const { client, options: contextOptions } = contextValue;
                    const safeArgs = this.validateArguments(args, contextOptions);
                    const { prismaSelect, transformPlan: schemaMapping } = this.parseGraphQLProjection(info, contextOptions);
                    const rawResult = await client[lower][operation]({
                        ...safeArgs,
                        select: prismaSelect
                    });
                    return await this.applyDirectives(rawResult, schemaMapping, info.variableValues);
                };
            }
            return acc;
        }, {});
    }

}
