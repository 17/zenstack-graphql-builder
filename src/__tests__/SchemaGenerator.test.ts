import { GraphQLSchema, GraphQLInt, GraphQLDirective, DirectiveLocation } from 'graphql';
import { SchemaGenerator } from '../schema/SchemaGenerator';
import { QueryBuilder } from '../schema/QueryBuilder';
import { MutationBuilder } from '../schema/MutationBuilder';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';
import { DirectiveRegistry } from '../directives/DirectiveRegistry';

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

const UpperCaseDirective = new GraphQLDirective({
    name: 'upperCase',
    description: '将字符串字段转换为大写',
    locations: [DirectiveLocation.FIELD],
});


describe('SchemaGenerator', () => {
    it('should generate a valid GraphQLSchema', () => {
        const typeCache = new TypeCache();
        const modelHelper = new ModelHelper(mockZenSchema);
        const filterBuilder = new FilterBuilder(typeCache, { Int: GraphQLInt } as any);
        const typeResolver = new TypeResolver(typeCache, { Int: GraphQLInt } as any);
        const inputTypeBuilder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
        const outputTypeBuilder = new OutputTypeBuilder(typeCache, modelHelper, typeResolver, inputTypeBuilder);
        const queryBuilder = new QueryBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);
        const mutationBuilder = new MutationBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);

        const registry = new DirectiveRegistry();
        registry.registerDefinition(UpperCaseDirective);

        const generator = new SchemaGenerator(
            queryBuilder,
            mutationBuilder,
            typeCache,
            registry,
            ['User']
        );

        const schema = generator.generate();

        expect(schema).toBeInstanceOf(GraphQLSchema);
        expect(schema.getQueryType()?.name).toBe('Query');
        expect(schema.getMutationType()?.name).toBe('Mutation');
        expect(schema.getDirective('upperCase')).toBeDefined();

        // Check if Query has user queries
        const queryFields = schema.getQueryType()?.getFields();
        expect(queryFields?.user_findMany).toBeDefined();

        // Check if Mutation has user mutations
        const mutationFields = schema.getMutationType()?.getFields();
        expect(mutationFields?.user_create).toBeDefined();
    });
});
