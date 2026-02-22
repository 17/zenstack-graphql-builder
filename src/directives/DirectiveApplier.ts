import { DirectiveRegistry } from './DirectiveRegistry';
import { TransformPlan } from './DirectiveExtractor';

export class DirectiveApplier {
    private registry: DirectiveRegistry;

    constructor(registry: DirectiveRegistry) {
        this.registry = registry;
    }

    /**
     * 递归应用指令转换
     * @param data Prisma 返回的数据
     * @param plan transformPlan
     * @param vars 变量
     */
    async applyDirectives(data: any, plan: TransformPlan | null, vars: any = {}): Promise<any> {
        if (!data || !plan) return data;

        // 处理数组性能优化：使用 Promise.all 并行处理
        if (Array.isArray(data)) {
            return Promise.all(data.map((item) => this.applyDirectives(item, plan, vars)));
        }

        // 浅拷贝对象以避免副作用
        const result = { ...data };

        for (const fieldName in plan) {
            const planItem = plan[fieldName];
            if (!planItem) continue;

            const { directives, nested } = planItem;
            let value = result[fieldName];

            if (value === undefined) continue;

            // 1. 先处理嵌套数据
            if (nested && value !== null) {
                value = await this.applyDirectives(value, nested, vars);
            }

            // 2. 顺序执行当前字段的所有指令
            if (directives) {
                for (const dir of directives) {
                    const handler = this.registry.getHandler(dir.name);
                    if (handler) {
                        value = await handler(value, dir.args || {}, vars, fieldName);
                    } else {
                        console.warn(`[DirectiveApplier] No handler registered for directive "@${dir.name}"`);
                    }
                }
            }

            result[fieldName] = value;
        }

        return result;
    }
}
