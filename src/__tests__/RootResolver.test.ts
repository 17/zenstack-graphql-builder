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
});
