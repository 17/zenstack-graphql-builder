import { GraphQLString, GraphQLInt, GraphQLObjectType } from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from '../types/InputTypeBuilder';

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
                authorId: { type: 'Int' },
                author: { type: 'User', relation: true, foreignKeyFor: 'authorId' },
            },
        }
    },
};

describe('InputTypeBuilder', () => {
    let typeCache: TypeCache;
    let filterBuilder: FilterBuilder;
    let modelHelper: ModelHelper;
    let typeResolver: TypeResolver;
    let builder: InputTypeBuilder;

    beforeEach(() => {
        typeCache = new TypeCache();
        modelHelper = new ModelHelper(mockZenSchema);
        filterBuilder = new FilterBuilder(typeCache, { Int: GraphQLInt } as any);
        typeResolver = new TypeResolver(typeCache, { Int: GraphQLInt } as any);
        builder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
    });

    it('should build WhereInput for a model', () => {
        const whereInput = builder.getWhereInput('User');
        expect(whereInput).toBeDefined();
        expect(whereInput.name).toBe('UserWhereInput');
        const fields = whereInput.getFields();
        expect(fields.AND).toBeDefined();
        expect(fields.name).toBeDefined();
        expect(fields.posts).toBeDefined(); // Relation filter
    });

    it('should build WhereUniqueInput for a model', () => {
        const whereUnique = builder.getWhereUniqueInput('User');
        expect(whereUnique).toBeDefined();
        expect(whereUnique.name).toBe('UserWhereUniqueInput');
        const fields = whereUnique.getFields();
        expect(fields.id).toBeDefined();
        expect(fields.name).toBeUndefined();
    });

    it('should build OrderByInput for a model', () => {
        const orderBy = builder.getOrderByInput('User');
        expect(orderBy).toBeDefined();
        expect(orderBy.name).toBe('UserOrderByInput');
        const fields = orderBy.getFields();
        expect(fields.name).toBeDefined();
        expect(fields.posts).toBeDefined();
    });

    it('should build CreateInput for a model', () => {
        const create = builder.getCreateInput('User');
        expect(create).toBeDefined();
        expect(create.name).toBe('UserCreateInput');
        const fields = create.getFields();
        expect(fields.name).toBeDefined();
        expect(fields.id).toBeUndefined(); // auto-increment omitted
        expect(fields.posts).toBeDefined(); // relation create input
    });

    it('should build UpdateInput for a model', () => {
        const update = builder.getUpdateInput('User');
        expect(update).toBeDefined();
        expect(update.name).toBe('UserUpdateInput');
        const fields = update.getFields();
        expect(fields.name).toBeDefined();
        expect(fields.posts).toBeDefined();
    });

    it('should retrieve from cache on subsequent calls', () => {
        const t1 = builder.getWhereInput('User');
        const t2 = builder.getWhereInput('User');
        expect(t1).toBe(t2);
    });
});
