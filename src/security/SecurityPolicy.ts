export interface SecurityOptions {
    maxTake: number;
    maxDepth: number;
    throwOnError: boolean;
}

export const DEFAULT_SECURITY_OPTIONS: SecurityOptions = {
    maxTake: 100,
    maxDepth: 9,
    throwOnError: false,
};

export class SecurityPolicy {
    private options: SecurityOptions;

    constructor(options: Partial<SecurityOptions> = {}) {
        this.options = { ...DEFAULT_SECURITY_OPTIONS, ...options };
    }

    /**
     * 应用安全规则到参数上
     */
    applySecurityRules(key: string, value: any): any {
        const quantityKeys = ['take', 'first', 'last', 'limit'];
        if (quantityKeys.includes(key) && typeof value === 'number') {
            if (value > this.options.maxTake) {
                if (this.options.throwOnError) {
                    throw new Error(`[Security Violation] '${key}' exceeds max limit of ${this.options.maxTake}`);
                }
                return this.options.maxTake;
            }
        }
        return value;
    }

    /**
     * 校验并清理一组参数
     */
    validateArguments(argsObject: any): any {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(argsObject || {})) {
            sanitized[key] = this.applySecurityRules(key, val);
        }
        return sanitized;
    }
}
