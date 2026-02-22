import { ZenStackGraphQLBuilder } from '../index';
import { GraphQLSchema } from 'graphql';

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

describe('ZenStackGraphQLBuilder Integration', () => {
    it('should build full schema and root value successfully', () => {
        const builder = new ZenStackGraphQLBuilder({
            schema: mockZenSchema,
        });

        const schema = builder.getSchema();
        const rootResolver = builder.getRootResolver();

        expect(schema).toBeInstanceOf(GraphQLSchema);
        expect(rootResolver.user_findMany).toBeDefined();
        expect(rootResolver.post_findMany).toBeDefined();

        const queryType = schema.getQueryType();
        expect(queryType).toBeDefined();
        expect(queryType?.getFields().user_findUnique).toBeDefined();
        expect(queryType?.getFields().post_findUnique).toBeDefined();

        const mutationType = schema.getMutationType();
        expect(mutationType).toBeDefined();
        expect(mutationType?.getFields().user_create).toBeDefined();
        expect(mutationType?.getFields().post_create).toBeDefined();
    });

    it('should support custom directives configuration', () => {
        const builder = new ZenStackGraphQLBuilder({
            schema: mockZenSchema,
            directives: {
                upperCase: (value: any) => typeof value === 'string' ? value.toUpperCase() : value,
            }
        });

        const schema = builder.getSchema();
        expect(schema).toBeInstanceOf(GraphQLSchema);
    });
});
