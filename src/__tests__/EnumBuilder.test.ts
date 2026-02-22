import { TypeCache } from '../types/TypeCache';
import { EnumBuilder } from '../types/EnumBuilder';
import { GraphQLEnumType } from 'graphql';

describe('EnumBuilder', () => {
    let typeCache: TypeCache;
    let enumBuilder: EnumBuilder;

    beforeEach(() => {
        typeCache = new TypeCache();
        enumBuilder = new EnumBuilder(typeCache);
    });

    it('should build enum types from zenSchema and cache them', () => {
        const zenSchema = {
            enums: {
                Role: {
                    USER: {},
                    ADMIN: {}
                },
                Status: {
                    ACTIVE: {},
                    INACTIVE: {}
                }
            }
        };

        enumBuilder.buildEnums(zenSchema);

        expect(typeCache.has('Role')).toBe(true);
        expect(typeCache.has('Status')).toBe(true);

        const roleEnum = typeCache.get<GraphQLEnumType>('Role');
        expect(roleEnum).toBeDefined();
        expect(roleEnum instanceof GraphQLEnumType).toBe(true);
        expect(roleEnum?.getValue('USER')).toBeDefined();
        expect(roleEnum?.getValue('ADMIN')).toBeDefined();
    });

    it('should do nothing if zenSchema has no enums', () => {
        enumBuilder.buildEnums({});
        expect(typeCache.values()).toHaveLength(0);
    });
});
