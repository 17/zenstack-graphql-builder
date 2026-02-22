import { GraphQLInt } from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';
import { MutationBuilder } from '../schema/MutationBuilder';

const mockZenSchema = {
    models: {
        User: {
            idFields: ['id'],
            fields: {
                id: { type: 'Int', default: { name: 'autoincrement' } },
                name: { type: 'String' },
            },
        }
    },
};

describe('MutationBuilder', () => {
    it('should build mutation fields for models', () => {
        const typeCache = new TypeCache();
        const modelHelper = new ModelHelper(mockZenSchema);
        const filterBuilder = new FilterBuilder(typeCache, { Int: GraphQLInt } as any);
        const typeResolver = new TypeResolver(typeCache, { Int: GraphQLInt } as any);
        const inputTypeBuilder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
        const outputTypeBuilder = new OutputTypeBuilder(typeCache, modelHelper, typeResolver, inputTypeBuilder);
        const mutationBuilder = new MutationBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);

        const mutations = mutationBuilder.buildMutationFields(['User']);

        expect(mutations.user_create).toBeDefined();
        expect(mutations.user_createMany).toBeDefined();
        expect(mutations.user_createManyAndReturn).toBeDefined();
        expect(mutations.user_update).toBeDefined();
        expect(mutations.user_updateMany).toBeDefined();
        expect(mutations.user_updateManyAndReturn).toBeDefined();
        expect(mutations.user_upsert).toBeDefined();
        expect(mutations.user_delete).toBeDefined();
        expect(mutations.user_deleteMany).toBeDefined();
    });
});
