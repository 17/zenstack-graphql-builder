import { GraphQLInt, GraphQLString } from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';
import { QueryBuilder } from '../schema/QueryBuilder';

const mockZenSchema = {
    models: {
        User: {
            idFields: ['id'],
            fields: {
                id: { type: 'Int', default: { name: 'autoincrement' } },
                name: { type: 'String' },
                posts: { type: 'Post', array: true, relation: true },
            },
        }
    },
};

describe('QueryBuilder', () => {
    it('should build query fields for models', () => {
        const typeCache = new TypeCache();
        const modelHelper = new ModelHelper(mockZenSchema);
        const filterBuilder = new FilterBuilder(typeCache, { Int: GraphQLInt } as any);
        const typeResolver = new TypeResolver(typeCache, { Int: GraphQLInt } as any);
        const inputTypeBuilder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
        const outputTypeBuilder = new OutputTypeBuilder(typeCache, modelHelper, typeResolver, inputTypeBuilder);
        const queryBuilder = new QueryBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);

        const queries = queryBuilder.buildQueryFields(['User']);

        expect(queries.user_findUnique).toBeDefined();
        expect(queries.user_findFirst).toBeDefined();
        expect(queries.user_findMany).toBeDefined();
        expect(queries.user_count).toBeDefined();
        expect(queries.user_aggregate).toBeDefined();
        expect(queries.user_groupBy).toBeDefined();
        expect(queries.user_exists).toBeDefined();
        expect(queries.user_findUniqueOrThrow).toBeDefined();
    });
});
