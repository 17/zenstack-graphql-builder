import { GraphQLSchema, GraphQLObjectType, specifiedDirectives } from 'graphql';
import { QueryBuilder } from './QueryBuilder';
import { MutationBuilder } from './MutationBuilder';
import { TypeCache } from '../types/TypeCache';
import { DirectiveRegistry } from '../directives/DirectiveRegistry';
import { SortOrderEnum, NullsOrderEnum, QueryModeEnum } from '../types/enums';
import { DateTimeScalar, JsonScalar, BigIntScalar, BytesScalar, DecimalScalar } from '../types/scalars';

export class SchemaGenerator {
    private queryBuilder: QueryBuilder;
    private mutationBuilder: MutationBuilder;
    private typeCache: TypeCache;
    private directiveRegistry: DirectiveRegistry;
    private modelNames: string[];

    constructor(
        queryBuilder: QueryBuilder,
        mutationBuilder: MutationBuilder,
        typeCache: TypeCache,
        directiveRegistry: DirectiveRegistry,
        modelNames: string[]
    ) {
        this.queryBuilder = queryBuilder;
        this.mutationBuilder = mutationBuilder;
        this.typeCache = typeCache;
        this.directiveRegistry = directiveRegistry;
        this.modelNames = modelNames;
    }

    /**
     * 组装并返回最终的 GraphQLSchema
     */
    generate(): GraphQLSchema {
        const queryFields = this.queryBuilder.buildQueryFields(this.modelNames);
        const mutationFields = this.mutationBuilder.buildMutationFields(this.modelNames);

        const queryType = new GraphQLObjectType({ name: 'Query', fields: queryFields });
        const mutationType = new GraphQLObjectType({ name: 'Mutation', fields: mutationFields });

        // 收集所有已缓存类型（过滤掉被直接引用的内置标量，如果需要）
        const allTypes = Array.from(this.typeCache.values());

        return new GraphQLSchema({
            query: queryType,
            mutation: mutationType,
            directives: [...specifiedDirectives, ...this.directiveRegistry.getDefinitions()],
            types: [
                ...(allTypes as any[]),
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
    }
}
