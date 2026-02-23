import { DirectiveRegistry } from '../directives/DirectiveRegistry';
import { GraphQLDirective, DirectiveLocation } from 'graphql';

const UpperCaseDirective = new GraphQLDirective({
    name: 'upperCase',
    description: '将字符串字段转换为大写',
    locations: [DirectiveLocation.FIELD],
});

describe('DirectiveRegistry', () => {
    it('should register and retrieve handlers', () => {
        const registry = new DirectiveRegistry();
        const mockHandler = vi.fn();

        registry.registerHandler('upperCase', mockHandler);

        expect(registry.getHandler('upperCase')).toBe(mockHandler);
        expect(registry.getHandler('unknown')).toBeUndefined();
    });

    it('should register and retrieve definitions', () => {
        const registry = new DirectiveRegistry();
        registry.registerDefinition(UpperCaseDirective);

        expect(registry.getDefinitions()).toContain(UpperCaseDirective);
    });
});
