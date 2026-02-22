import { DirectiveApplier } from '../directives/DirectiveApplier';
import { DirectiveRegistry } from '../directives/DirectiveRegistry';

describe('DirectiveApplier', () => {
    it('should apply directives sequentially to data', async () => {
        const registry = new DirectiveRegistry({
            upperCase: (val) => typeof val === 'string' ? val.toUpperCase() : val,
            mask: (val) => '***',
        });
        const applier = new DirectiveApplier(registry);

        const data = { name: 'john', email: 'john@example.com', unmapped: 'abc' };
        const plan = {
            name: { directives: [{ name: 'upperCase', args: {} }] },
            email: { directives: [{ name: 'mask', args: {} }] },
        };

        const result = await applier.applyDirectives(data, plan);
        expect(result.name).toBe('JOHN');
        expect(result.email).toBe('***');
        expect(result.unmapped).toBe('abc'); // Unmapped passed through
    });

    it('should handle nested plans and array data concurrently', async () => {
        const registry = new DirectiveRegistry({
            upperCase: (val) => typeof val === 'string' ? val.toUpperCase() : val,
        });
        const applier = new DirectiveApplier(registry);

        const data = {
            posts: [
                { title: 'hello', body: 'world' },
                { title: 'test', body: 'content' }
            ]
        };
        const plan = {
            posts: {
                nested: {
                    title: { directives: [{ name: 'upperCase', args: {} }] }
                }
            }
        };

        const result = await applier.applyDirectives(data, plan);
        expect(result.posts[0].title).toBe('HELLO');
        expect(result.posts[0].body).toBe('world');
        expect(result.posts[1].title).toBe('TEST');
    });

    it('should return raw data if plan is null', async () => {
        const applier = new DirectiveApplier(new DirectiveRegistry());
        const data = { a: 1 };
        const result = await applier.applyDirectives(data, null);
        expect(result).toEqual(data);
    });
});
