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

            for (let operation of this.operations) {
                rootValue[`${lower}_${operation}`] = async (args: any, contextValue: any, info: any) => {

                    const { client, options: contextOptions } = contextValue;
                    operation = operation.replaceAll('Atomic', '')

                    // 根据请求上下文中的 options 动态创建安全策略
                    const dynamicPolicy = new SecurityPolicy(contextOptions);
                    const dynamicExtractor = new DirectiveExtractor(dynamicPolicy);
                    const { prismaSelect, transformPlan } = dynamicExtractor.extract(info, info.variableValues, contextOptions.maxDepth);

                    const safeArgs = {
                        ...dynamicPolicy.validateArguments(args),
                        ...['aggregate', 'groupBy'].includes(operation) ? removeSelectKey(prismaSelect) : { select: prismaSelect }
                    };
                    const makeSchema = client.$zod[`make${operation.replace(/\b\w/g, char => char.toUpperCase()).replaceAll('OrThrow', '')}Schema`](model, {
                        relationDepth: contextOptions.maxDepth,
                    });
                    const validationResult = makeSchema.safeParse(safeArgs);
                    if (!validationResult.success && contextOptions.throwOnError) {
                        const issues = validationResult.error?.issues
                            ?.map((i: any) => `${i.path.join('.')}: ${i.message}`)
                            .join('; ');
                        throw new Error(
                            `[Validation Error] Query args validation failed for ${model}.${operation}: ${issues || 'Unknown error'}`
                        );
                    }
                    if (validationResult && !validationResult.success) {
                        // If throwOnError is false, validation failure was already handled
                        // (no throw from validator). We still proceed with the query
                        // but log the validation issue for observability.
                        return
                    }

                    const rawResult = await client[lower][operation](safeArgs);
                    return await this.applier.applyDirectives(rawResult, transformPlan, info.variableValues);
                };
            }
        }

        return rootValue;
    }
}

function removeSelectKey(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (obj.select) {
    // 发现 select 键，将其内容提升上来并继续递归
    return removeSelectKey(obj.select);
  }

  // 递归处理对象的所有属性
  const newObj = {};
  for (const key in obj) {
    newObj[key] = removeSelectKey(obj[key]);
  }
  return newObj;
}