import { GraphQLInt, GraphQLString, GraphQLObjectType, GraphQLEnumType } from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';

const mockZenSchema = {
    models: {
        User: {
            idFields: ['id'],
            fields: {
                id: { type: 'Int', default: { name: 'autoincrement' } },
                name: { type: 'String' },
                posts: { type: 'Post', array: true, relation: true },
            },
        },
        Post: {
            idFields: ['id'],
            fields: {
                id: { type: 'Int', default: { name: 'autoincrement' } },
                title: { type: 'String' },
                author: { type: 'User', relation: true },
            },
        }
    },
};

describe('OutputTypeBuilder', () => {
    let typeCache: TypeCache;
    let modelHelper: ModelHelper;
    let typeResolver: TypeResolver;
    let inputTypeBuilder: InputTypeBuilder;
    let outputBuilder: OutputTypeBuilder;

    beforeEach(() => {
        typeCache = new TypeCache();
        modelHelper = new ModelHelper(mockZenSchema);
        const filterBuilder = new FilterBuilder(typeCache, { Int: GraphQLInt } as any);
        typeResolver = new TypeResolver(typeCache, { Int: GraphQLInt } as any);
        inputTypeBuilder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
        outputBuilder = new OutputTypeBuilder(typeCache, modelHelper, typeResolver, inputTypeBuilder);
    });

    it('should build DistinctEnum for a model', () => {
        const distinctEnum = outputBuilder.getDistinctEnum('User');
        expect(distinctEnum).toBeDefined();
        expect(distinctEnum.name).toBe('UserDistinctFieldEnum');
        expect(distinctEnum.getValue('id')).toBeDefined();
        expect(distinctEnum.getValue('name')).toBeDefined();
        expect(distinctEnum.getValue('posts')).toBeUndefined(); // relations excluded
    });

    it('should build AffectedRowsOutput', () => {
        const payload = outputBuilder.getAffectedRowsOutput();
        expect(payload).toBeDefined();
        expect(payload.name).toBe('affectedRowsOutput');
        const fields = payload.getFields();
        expect(fields.count).toBeDefined();
    });

    it('should build CountAggregateOutput', () => {
        const countAgg = outputBuilder.getCountAggOutput('User');
        expect(countAgg).toBeDefined();
        expect(countAgg.name).toBe('UserCountAggregateOutput');
        const fields = countAgg.getFields();
        expect(fields._all).toBeDefined();
        expect(fields.id).toBeDefined();
    });

    it('should build OutputType for a model', () => {
        const userType = outputBuilder.getOutputType('User');
        expect(userType).toBeDefined();
        expect(userType.name).toBe('User');
        const fields = userType.getFields();

        expect(fields.id).toBeDefined();
        expect(fields.name).toBeDefined();
        expect(fields.posts).toBeDefined();
        expect(fields._count).toBeDefined(); // toMany relation count
    });

    it('should resolve from cache subsequently', () => {
        const t1 = outputBuilder.getOutputType('User');
        const t2 = outputBuilder.getOutputType('User');
        expect(t1).toBe(t2);
    });
});
