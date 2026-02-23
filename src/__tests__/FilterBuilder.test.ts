import { GraphQLInt, GraphQLScalarType } from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { FilterBuilder } from '../types/FilterBuilder';

describe('FilterBuilder', () => {
    let typeCache: TypeCache;
    let scalarRegistry: Record<string, GraphQLScalarType>;
    let filterBuilder: FilterBuilder;

    beforeEach(() => {
        typeCache = new TypeCache();
        scalarRegistry = {
            Int: GraphQLInt,
        } as any;
        filterBuilder = new FilterBuilder(typeCache, scalarRegistry);
    });

    it('should create StringFilter and cache it', () => {
        const stringFilter = filterBuilder.getFilter('String');
        expect(stringFilter).toBeDefined();
        expect(stringFilter?.name).toBe('StringFilter');
        const fields = stringFilter!.getFields();
        expect(fields.between).toBeDefined();
        expect(typeCache.has('StringFilter')).toBe(true);
        expect(typeCache.get('StringFilter')).toBe(stringFilter);
    });

    it('should return the cached StringFilter on subsequent calls', () => {
        const filter1 = filterBuilder.getFilter('String');
        const filter2 = filterBuilder.getFilter('String');
        expect(filter1).toBe(filter2);
    });

    it('should create IntFilter', () => {
        const intFilter = filterBuilder.getFilter('Int');
        expect(intFilter).toBeDefined();
        expect(intFilter?.name).toBe('IntFilter');
        expect(typeCache.has('IntFilter')).toBe(true);
    });

    it('should create BooleanFilter', () => {
        const boolFilter = filterBuilder.getFilter('Boolean');
        expect(boolFilter).toBeDefined();
        expect(boolFilter?.name).toBe('BooleanFilter');
    });

    it('should create DateTimeFilter', () => {
        const dateTimeFilter = filterBuilder.getFilter('DateTime');
        expect(dateTimeFilter).toBeDefined();
        expect(dateTimeFilter?.name).toBe('DateTimeFilter');
    });

    it('should create JsonFilter', () => {
        const jsonFilter = filterBuilder.getFilter('Json');
        expect(jsonFilter).toBeDefined();
        expect(jsonFilter?.name).toBe('JsonFilter');
    });

    it('should return null for unknown types', () => {
        const unknownFilter = filterBuilder.getFilter('UnknownType');
        expect(unknownFilter).toBeNull();
    });
});
