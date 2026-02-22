import { SecurityPolicy } from '../security/SecurityPolicy';
import { DepthLimiter } from '../security/DepthLimiter';
import { FieldNode } from 'graphql';

describe('DepthLimiter', () => {
    it('should pass valid shallow queries', () => {
        const policy = new SecurityPolicy({ maxDepth: 3 });
        const limiter = new DepthLimiter(policy);

        const node: any = {
            kind: 'Field',
            selectionSet: {
                selections: [
                    { kind: 'Field', selectionSet: { selections: [{ kind: 'Field' }] } }
                ]
            }
        };

        expect(limiter.validateDepth(node as FieldNode, {})).toBe(true);
    });

    it('should throw error for deep queries', () => {
        const policy = new SecurityPolicy({ maxDepth: 2 });
        const limiter = new DepthLimiter(policy);

        const node: any = {
            kind: 'Field',
            selectionSet: {
                selections: [
                    { kind: 'Field', selectionSet: { selections: [{ kind: 'Field' }] } }
                ]
            }
        };

        expect(() => limiter.validateDepth(node as FieldNode, {})).toThrow(/limit reached/);
    });
});
