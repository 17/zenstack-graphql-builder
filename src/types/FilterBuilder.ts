import {
    GraphQLInputObjectType,
    GraphQLString,
    GraphQLInt,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLList,
    GraphQLNonNull,
    GraphQLEnumType,
    GraphQLType,
    GraphQLScalarType,
} from 'graphql';
import { TypeCache } from './TypeCache';
import { QueryModeEnum } from './enums';
import {
    DateTimeScalar,
    BigIntScalar,
    DecimalScalar,
    BytesScalar,
    JsonScalar,
} from './scalars';

/**
 * FilterBuilder 用于构建各标量/枚举类型的输入过滤条件。
 */
export class FilterBuilder {
    private typeCache: TypeCache;
    private scalarRegistry: Record<string, GraphQLScalarType>;

    constructor(typeCache: TypeCache, scalarRegistry: Record<string, GraphQLScalarType>) {
        this.typeCache = typeCache;
        this.scalarRegistry = scalarRegistry;
    }

    /**
     * 根据类型名称获取对应的 Filter Input Type
     * @param typeName 类型名
     */
    getFilter(typeName: string): GraphQLInputObjectType | null {
        const name = `${typeName}Filter`;
        const cached = this.typeCache.get<GraphQLInputObjectType>(name);
        if (cached) return cached;

        // 如果是缓存中的枚举，创建枚举过滤器
        if (this.typeCache.has(typeName)) {
            const type = this.typeCache.get(typeName);
            if (type instanceof GraphQLEnumType) {
                return this.createEnumFilter(type);
            }
        }

        let filter: GraphQLInputObjectType | null = null;
        switch (typeName) {
            case 'String':
                filter = this.createStringFilter();
                break;
            case 'Int':
            case 'Float':
                filter = this.createNumberFilter(typeName);
                break;
            case 'Boolean':
                filter = this.createBooleanFilter();
                break;
            case 'DateTime':
                filter = this.createDateTimeFilter();
                break;
            case 'BigInt':
                filter = this.createBigIntFilter();
                break;
            case 'Decimal':
                filter = this.createDecimalFilter();
                break;
            case 'Bytes':
                filter = this.createBytesFilter();
                break;
            case 'Json':
                filter = this.createJsonFilter();
                break;
            default:
                return null;
        }

        if (filter) {
            this.typeCache.set(name, filter);
        }
        return filter;
    }

    private createStringFilter(): GraphQLInputObjectType {
        const name = 'StringFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
                not: { type: this.getFilter('String')! },
                _count: { type: this.getFilter('Int')! },
                _min: { type: this.getFilter('String')! },
                _max: { type: this.getFilter('String')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createNumberFilter(typeName: string): GraphQLInputObjectType {
        const name = typeName === 'Int' ? 'IntFilter' : typeName === 'Float' ? 'FloatFilter' : 'NumberFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
                not: { type: this.getFilter(typeName)! },
                _count: { type: this.getFilter('Int')! },
                _avg: { type: this.getFilter(typeName)! },
                _sum: { type: this.getFilter(typeName)! },
                _min: { type: this.getFilter(typeName)! },
                _max: { type: this.getFilter(typeName)! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createBooleanFilter(): GraphQLInputObjectType {
        const name = 'BooleanFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: GraphQLBoolean },
                not: { type: this.getFilter('Boolean')! },
                _count: { type: this.getFilter('Int')! },
                _min: { type: this.getFilter('Boolean')! },
                _max: { type: this.getFilter('Boolean')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createDateTimeFilter(): GraphQLInputObjectType {
        const name = 'DateTimeFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
                not: { type: this.getFilter('DateTime')! },
                _count: { type: this.getFilter('Int')! },
                _min: { type: this.getFilter('DateTime')! },
                _max: { type: this.getFilter('DateTime')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createBigIntFilter(): GraphQLInputObjectType {
        const name = 'BigIntFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
                not: { type: this.getFilter('BigInt')! },
                _count: { type: this.getFilter('Int')! },
                _avg: { type: this.getFilter('BigInt')! },
                _sum: { type: this.getFilter('BigInt')! },
                _min: { type: this.getFilter('BigInt')! },
                _max: { type: this.getFilter('BigInt')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createDecimalFilter(): GraphQLInputObjectType {
        const name = 'DecimalFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
                not: { type: this.getFilter('Decimal')! },
                _count: { type: this.getFilter('Int')! },
                _avg: { type: this.getFilter('Decimal')! },
                _sum: { type: this.getFilter('Decimal')! },
                _min: { type: this.getFilter('Decimal')! },
                _max: { type: this.getFilter('Decimal')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createBytesFilter(): GraphQLInputObjectType {
        const name = 'BytesFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: BytesScalar },
                in: { type: new GraphQLList(new GraphQLNonNull(BytesScalar)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(BytesScalar)) },
                not: { type: this.getFilter('Bytes')! },
                _count: { type: this.getFilter('Int')! },
                _min: { type: this.getFilter('Bytes')! },
                _max: { type: this.getFilter('Bytes')! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }

    private createJsonFilter(): GraphQLInputObjectType {
        const name = 'JsonFilter';
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
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
        this.typeCache.set(name, filter);
        return filter;
    }

    private createEnumFilter(enumType: GraphQLEnumType): GraphQLInputObjectType {
        const name = `${enumType.name}Filter`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const filter = new GraphQLInputObjectType({
            name,
            fields: () => ({
                equals: { type: enumType },
                in: { type: new GraphQLList(new GraphQLNonNull(enumType)) },
                notIn: { type: new GraphQLList(new GraphQLNonNull(enumType)) },
                not: { type: this.getFilter(enumType.name)! },
                _count: { type: this.getFilter('Int')! },
                _min: { type: this.getFilter(enumType.name)! },
                _max: { type: this.getFilter(enumType.name)! },
            }),
        });
        this.typeCache.set(name, filter);
        return filter;
    }
}
