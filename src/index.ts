import {
    GraphQLSchema, valueFromASTUntyped, SelectionSetNode,
    FragmentDefinitionNode, specifiedDirectives
} from 'graphql';

import {
    CoreCrudOperations as AllCrudOperations,
    CoreReadOperations as AllReadOperations,
    CoreWriteOperations as AllWriteOperations
} from '@zenstackhq/orm';
import {
    type ClientOptions,
    type ExtQueryArgsBase,
} from '@zenstackhq/orm';
import {
    type SchemaDef,
} from '@zenstackhq/schema';

import Scalars from './scalars'
import { GraphQLTypeFactory } from './type'

export interface ZenStackGraphQLBuilderConfig {
    options?: ZenStackGraphQLBuilderOptions;
    directives?: any;
    directiveDefinitions?: any;
    scalars?: any;
}

export interface ZenStackGraphQLBuilderOptions {
    maxDepth?: number;
    throwOnError?: boolean;
    useBigIntScalar?: boolean;
    formatFieldName?: (model: string, operation: string) => string;
}

export interface DirectiveConfig {
    name: string;
    args: any;
}

export interface TransformPlan {
    [fieldName: string]: {
        directives?: DirectiveConfig[] | null;
        nested?: TransformPlan | null;
    };
}

export interface ParseResult {
    prismaSelect: any;
    transformPlan: TransformPlan | null;
}

export type DirectiveHandler = (value: any, args: any, variableValues: any, fieldName: string) => any | Promise<any>;

export const defaultOptions: ZenStackGraphQLBuilderOptions = {
    maxDepth: 9,
    throwOnError: false,
    useBigIntScalar: false,
    formatFieldName: (model: string, operation: string) => {
        const lower = model[0].toLowerCase() + model.slice(1);
        return `${lower}_${operation}`
    }
}

export class ZenStackGraphQLBuilder<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
> {
    private zenStackSchema: Schema;
    private zenStackOptions: Options;
    private builderConfig: ZenStackGraphQLBuilderConfig;
    private options: ZenStackGraphQLBuilderOptions;
    private scalarMap: any;
    private typeFactory: GraphQLTypeFactory<Schema, Options>;
    private _schema: GraphQLSchema | null = null;
    private _rootResolver: Record<string, Function> | null = null;
    private directiveHandlers: Record<string, DirectiveHandler>;

    constructor(clientOrSchema: any, config?: ZenStackGraphQLBuilderConfig) {
        if ('$schema' in clientOrSchema) {
            this.zenStackSchema = clientOrSchema.$schema;
            this.zenStackOptions = clientOrSchema.$options;
        } else {
            this.zenStackSchema = clientOrSchema;
        }

        this.builderConfig = config;
        this.options = {
            ...defaultOptions,
            ...config?.options,
        };

        this.scalarMap = {
            ...Scalars,
            ...this.builderConfig?.scalars || {},
            Int: this.options.useBigIntScalar ? Scalars.BigInt : Scalars.Int
        };
        this.directiveHandlers = this.builderConfig?.directives || {};
        this.typeFactory = new GraphQLTypeFactory(this.zenStackSchema, this.scalarMap, this.zenStackOptions, this.options.formatFieldName);
        this._schema = this.buildGraphQLSchema();
        this._rootResolver = this.createRootResolver();
    }

    get modelNames() {
        return Object.keys(this.typeFactory.schema.models);
    }

    buildGraphQLSchema(): GraphQLSchema {
        const queryType = this.typeFactory.makeRootType('Query', AllReadOperations);
        const mutationType = this.typeFactory.makeRootType('Mutation', AllWriteOperations);

        return new GraphQLSchema({
            query: queryType,
            mutation: mutationType,
            directives: [...specifiedDirectives, ...this.builderConfig?.directiveDefinitions || []],
            types: [
                ...(Object.values(this.scalarMap || {}) as any),
            ],
        });
    }

    /**
     * 解析 AST 节点中的参数值
     */
    parseAstArguments(nodes: readonly any[] | undefined, variables: any): any {
        if (!nodes || nodes.length === 0) return null;
        const args: any = {};
        for (const node of nodes) {
            args[node.name.value] = valueFromASTUntyped(node.value, variables);
        }
        return args;
    }

    /**
     * 递归遍历 GraphQL AST 选择集，提取 Prisma select 对象与指令执行计划
     */
    traverseAstNode(
        selectionSet: SelectionSetNode | undefined,
        fragments: Record<string, FragmentDefinitionNode>,
        variables: any,
        isAggregation: boolean,
        remainingDepth: number
    ): { prismaSelect: any; transformPlan: TransformPlan | null } {
        const prismaSelect: any = {};
        const transformPlan: TransformPlan = {};
        let hasDirectivesInTree = false;

        if (!selectionSet || remainingDepth <= 0) {
            return { prismaSelect: undefined, transformPlan: null };
        }

        for (const selection of selectionSet.selections) {
            // 处理片段 (Fragments)
            if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
                const fragment =
                    selection.kind === 'FragmentSpread'
                        ? fragments[selection.name.value]
                        : selection;
                if (fragment?.selectionSet) {
                    const result = this.traverseAstNode(fragment.selectionSet, fragments, variables, isAggregation, remainingDepth);
                    Object.assign(prismaSelect, result.prismaSelect);
                    if (result.transformPlan) {
                        Object.assign(transformPlan, result.transformPlan);
                        hasDirectivesInTree = true;
                    }
                }
                continue;
            }

            // 处理字段
            if (selection.kind === 'Field') {
                const fieldName = selection.name.value;

                const args = this.parseAstArguments(selection.arguments, variables);
                const validatedArgs = args;

                const directiveConfigs =
                    selection.directives?.map((d) => ({
                        name: d.name.value,
                        args: this.parseAstArguments(d.arguments, variables) || {},
                    })) || [];

                if (selection.selectionSet) {
                    // 嵌套字段
                    const subResult = this.traverseAstNode(
                        selection.selectionSet,
                        fragments,
                        variables,
                        isAggregation,
                        remainingDepth - 1
                    );
                    if (!subResult.prismaSelect && !subResult.transformPlan) {
                        continue;
                    }

                    // const isAggregationField = ['_avg', '_count', '_max', '_min', '_sum'].includes(fieldName);
                    prismaSelect[fieldName] = {
                        ...(isAggregation ? subResult.prismaSelect : { select: subResult.prismaSelect }),
                        ...validatedArgs,
                    };

                    if (directiveConfigs.length > 0 || subResult.transformPlan) {
                        transformPlan[fieldName] = {
                            directives: directiveConfigs.length > 0 ? directiveConfigs : null,
                            nested: subResult.transformPlan,
                        };
                        hasDirectivesInTree = true;
                    }
                } else {
                    // 叶子字段
                    prismaSelect[fieldName] = true;
                    if (directiveConfigs.length > 0) {
                        transformPlan[fieldName] = { directives: directiveConfigs };
                        hasDirectivesInTree = true;
                    }
                }
            }
        }

        return {
            prismaSelect: Object.keys(prismaSelect).length > 0 ? prismaSelect : undefined,
            transformPlan: hasDirectivesInTree ? transformPlan : null,
        };
    }

    /**
     * 从 GraphQL Resolver 的 info 参数中解析 Prisma select 与指令转换计划
     */
    parseSelectionAndPlan(info: any, variables: any = {}, isAggregation: boolean = false, depth: number = Number.MAX_SAFE_INTEGER): ParseResult {
        const { fieldNodes, fragments } = info;
        if (!fieldNodes || fieldNodes.length === 0) {
            return { prismaSelect: undefined, transformPlan: null };
        }
        return this.traverseAstNode(fieldNodes[0].selectionSet, fragments, variables, isAggregation, depth);
    }

    /**
     * 对 Prisma 返回数据递归应用指令转换
     */
    async applyDirectives(data: any, plan: TransformPlan | null, variableValues: any = {}): Promise<any> {
        if (!data || !plan) return data;

        if (Array.isArray(data)) {
            return Promise.all(data.map((item) => this.applyDirectives(item, plan, variableValues)));
        }

        const result = { ...data };
        const tasks = Object.entries(plan).map(async ([fieldName, config]) => {
            if (!config || result[fieldName] === undefined) return;

            let value = result[fieldName];

            // 1. 递归处理嵌套字段
            if (config.nested && value !== null) {
                value = await this.applyDirectives(value, config.nested, variableValues);
            }

            // 2. 按序应用当前字段指令
            if (config.directives?.length) {
                for (const dir of config.directives) {
                    const handler = this.directiveHandlers[dir.name];
                    if (handler) {
                        value = await handler(value, dir.args, variableValues, fieldName);
                    }
                }
            }
            result[fieldName] = value;
        });

        await Promise.all(tasks);
        return result;
    }

    /**
     * 创建根解析器对象，包含所有模型的 CRUD 操作解析函数
     */
    createRootResolver(): Record<string, Function> {
        const rootResolver: Record<string, Function> = {};

        for (const model of this.modelNames) {
            const modelNameLower = model[0].toLowerCase() + model.slice(1);

            for (let operation of AllCrudOperations) {
                rootResolver[`${modelNameLower}_${operation}`] = async (args: any, contextValue: any, info: any) => {
                    const { client, options: contextOptions } = contextValue;
                    const options = {
                        ...this.options,
                        ...contextOptions,
                    };

                    const isAggregation = operation === 'aggregate';
                    const { prismaSelect, transformPlan } = this.parseSelectionAndPlan(
                        info,
                        info.variableValues,
                        isAggregation,
                        options.throwOnError ? options.maxDepth : Number.MAX_SAFE_INTEGER
                    );

                    const validatedArgs = {
                        ...args,
                        ...(['exists', 'groupBy'].includes(operation) ? {} :
                            isAggregation ? prismaSelect : { select: prismaSelect }),
                    };

                    const makeSchema = client.$zod[`make${operation.replace(/\b\w/g, char => char.toUpperCase())}Schema`](
                        model,
                        { relationDepth: options.maxDepth }
                    );

                    const validationResult = makeSchema.safeParse(validatedArgs);
                    if (!validationResult.success) {
                        const issues = validationResult.error?.issues
                            ?.map((i: any) => `${i.path.join('.')}: ${i.message}`)
                            .join('; ');
                        throw new Error(
                            `[Validation Error] Query args validation failed for ${model}.${operation}: ${issues || 'Unknown error'}`
                        );
                    }

                    const rawResult = await client[modelNameLower][operation](validatedArgs);
                    return await this.applyDirectives(rawResult, transformPlan, info.variableValues);
                };
            }
        }

        return rootResolver;
    }

    /**
     * 获取构建好的 GraphQL Schema
     */
    getSchema(): GraphQLSchema {
        if (!this._schema) throw new Error('Schema not generated yet');
        return this._schema;
    }

    /**
     * 获取构建好的根解析器
     */
    getRootResolver(): Record<string, Function> {
        if (!this._rootResolver) throw new Error('RootResolver not generated yet');
        return this._rootResolver;
    }
}