import { RootResolver } from '../resolvers/RootResolver';
import { DirectiveExtractor } from '../directives/DirectiveExtractor';
import { DirectiveApplier } from '../directives/DirectiveApplier';
import { SecurityPolicy } from '../security/SecurityPolicy';
import { DirectiveRegistry } from '../directives/DirectiveRegistry';

describe('RootResolver', () => {
    it('should build root value functions', async () => {
        const policy = new SecurityPolicy();
        const extractor = new DirectiveExtractor(policy);
        const registry = new DirectiveRegistry();
        const applier = new DirectiveApplier(registry);
        const resolver = new RootResolver(['User'], ['findMany', 'create'], extractor, applier);

        const rootValue = resolver.buildRootValue();

        expect(rootValue.user_findMany).toBeDefined();
        expect(rootValue.user_create).toBeDefined();
        expect(rootValue.user_update).toBeUndefined(); // Only injected 'findMany' and 'create'
    });

    it('should invoke client methods', async () => {
        const policy = new SecurityPolicy();
        const extractor = new DirectiveExtractor(policy);
        const registry = new DirectiveRegistry();
        const applier = new DirectiveApplier(registry);
        const resolver = new RootResolver(['User'], ['findUnique'], extractor, applier);

        const rootValue = resolver.buildRootValue();
        const mockClient = {
            user: {
                findUnique: vi.fn().mockResolvedValue({ id: 1, name: 'Test' })
            }
        };

        const mockInfo = { fieldNodes: [{ kind: 'Field', name: { value: 'user_findUnique' }, selectionSet: { selections: [{ kind: 'Field', name: { value: 'id' } }] } }], fragments: {} };

        const result = await rootValue.user_findUnique({ where: { id: 1 } }, { client: mockClient, options: {} }, mockInfo);

        expect(mockClient.user.findUnique).toHaveBeenCalled();
        const callArgs = mockClient.user.findUnique.mock.calls[0][0];
        expect(callArgs.where).toEqual({ id: 1 });
        expect(callArgs.select.id).toBe(true);
        expect(result).toEqual({ id: 1, name: 'Test' });
    });
});
