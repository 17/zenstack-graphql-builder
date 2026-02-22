import { SecurityPolicy } from '../security/SecurityPolicy';
import { DirectiveExtractor } from '../directives/DirectiveExtractor';
import { DirectiveApplier } from '../directives/DirectiveApplier';

export const AllCrudOperations = [
    'findMany', 'findUnique', 'findFirst', 'create', 'createMany',
    'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn',
    'upsert', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
    'exists', 'findUniqueOrThrow', 'findFirstOrThrow'
];

export class RootResolver {
    private modelNames: string[];
    private operations: string[];
    private extractor: DirectiveExtractor;
    private applier: DirectiveApplier;

    constructor(
        modelNames: string[],
        operations: string[],
        extractor: DirectiveExtractor,
        applier: DirectiveApplier
    ) {
        this.modelNames = modelNames;
        this.operations = operations?.length ? operations : AllCrudOperations;
        this.extractor = extractor;
        this.applier = applier;
    }

    /**
     * 静态生成 rootValue 结构
     */
    buildRootValue(): Record<string, Function> {
        const rootValue: Record<string, Function> = {};

        for (const model of this.modelNames) {
            const lower = model[0].toLowerCase() + model.slice(1);

            for (const operation of this.operations) {
                rootValue[`${lower}_${operation}`] = async (args: any, contextValue: any, info: any) => {
                    const { client, options: contextOptions } = contextValue;

                    // 根据请求上下文中的 options 动态创建或覆盖安全策略
                    const dynamicPolicy = new SecurityPolicy(contextOptions);
                    // 重新初始化一个带有动态 Policy 的 Extractor（可优化为传参方式）
                    const dynamicExtractor = new DirectiveExtractor(dynamicPolicy);

                    const safeArgs = dynamicPolicy.validateArguments(args);
                    const { prismaSelect, transformPlan } = dynamicExtractor.extract(info, info.variableValues);

                    const rawResult = await client[lower][operation]({
                        ...safeArgs,
                        select: prismaSelect
                    });

                    return await this.applier.applyDirectives(rawResult, transformPlan, info.variableValues);
                };
            }
        }

        return rootValue;
    }
}
