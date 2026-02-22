import { GraphQLObjectType, GraphQLString } from 'graphql';
import { TypeCache } from '../types/TypeCache';

describe('TypeCache', () => {
    let cache: TypeCache;

    beforeEach(() => {
        cache = new TypeCache();
    });

    it('should initialize empty', () => {
        expect(cache.values()).toHaveLength(0);
        expect(cache.has('SomeType')).toBe(false);
    });

    it('should store and retrieve types', () => {
        const dummyType = new GraphQLObjectType({
            name: 'Dummy',
            fields: { id: { type: GraphQLString } }
        });

        cache.set('Dummy', dummyType);

        expect(cache.has('Dummy')).toBe(true);
        expect(cache.get('Dummy')).toBe(dummyType);
        expect(cache.values()).toContain(dummyType);
    });

    it('should return undefined for missing types', () => {
        expect(cache.get('Missing')).toBeUndefined();
    });

    it('should clear the cache', () => {
        const dummyType = new GraphQLObjectType({
            name: 'Dummy',
            fields: { id: { type: GraphQLString } }
        });
        cache.set('Dummy', dummyType);
        expect(cache.has('Dummy')).toBe(true);

        cache.clear();
        expect(cache.has('Dummy')).toBe(false);
        expect(cache.values()).toHaveLength(0);
    });
});
