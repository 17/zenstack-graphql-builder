import { SecurityPolicy } from '../security/SecurityPolicy';

describe('SecurityPolicy', () => {
    it('should enforce default maxTake limit', () => {
        const policy = new SecurityPolicy();
        expect(policy.applySecurityRules('take', 150)).toBe(100);
        expect(policy.applySecurityRules('first', 101)).toBe(100);
        expect(policy.applySecurityRules('take', 50)).toBe(50);
    });

    it('should throw error on maxTake exceed if throwOnError is true', () => {
        const policy = new SecurityPolicy({ throwOnError: true, maxTake: 50 });
        expect(() => policy.applySecurityRules('take', 60)).toThrow(/exceeds max limit/);
    });

    it('should ignore non-quantity keys', () => {
        const policy = new SecurityPolicy();
        expect(policy.applySecurityRules('where', { id: 1 })).toEqual({ id: 1 });
    });

    it('should sanitize arguments object', () => {
        const policy = new SecurityPolicy({ maxTake: 20 });
        const args = { where: { id: 1 }, take: 100, skip: 10 };
        const sanitized = policy.validateArguments(args);

        expect(sanitized.take).toBe(20);
        expect(sanitized.skip).toBe(10);
        expect(sanitized.where).toEqual({ id: 1 });
    });

    it('should throw error on depth limit if throwOnError is true', () => {
        const policy = new SecurityPolicy({ maxDepth: 5, throwOnError: true });
        expect(() => policy.checkDepth(5)).toThrow(/Query depth limit reached/);
    });
});
