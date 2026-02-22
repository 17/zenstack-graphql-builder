import { valueFromASTUntyped, SelectionSetNode, FragmentDefinitionNode } from 'graphql';
import { SecurityPolicy } from '../security/SecurityPolicy';

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

export class DirectiveExtractor {
    private securityPolicy: SecurityPolicy;

    constructor(securityPolicy: SecurityPolicy) {
        this.securityPolicy = securityPolicy;
    }

    /**
     * 解析 AST 节点参数
     */
    private getArgsFromAST(nodes: readonly any[] | undefined, variables: any): any {
        if (!nodes || nodes.length === 0) return null;
        const args: any = {};
        for (const node of nodes) {
            args[node.name.value] = valueFromASTUntyped(node.value, variables);
        }
        return args;
    }

    /**
     * 递归遍历 GraphQL AST，提取 Prisma 查询结构与指令执行计划
     * @param selectionSet 当前选择集
     * @param fragments Fragment 定义
     * @param variables 变量
     * @param depth 当前深度
     */
    traverseASTNode(
        selectionSet: SelectionSetNode | undefined,
        fragments: Record<string, FragmentDefinitionNode>,
        variables: any,
        depth: number
    ): ParseResult {
        this.securityPolicy.checkDepth(depth);

        const prismaSelect: any = {};
        const transformPlan: TransformPlan = {};
        let hasDirectivesInTree = false;

        if (!selectionSet) return { prismaSelect: undefined, transformPlan: null };

        for (const selection of selectionSet.selections) {
            // 1. 处理片段 (Fragments)
            if (selection.kind === 'FragmentSpread' || selection.kind === 'InlineFragment') {
                const fragment =
                    selection.kind === 'FragmentSpread'
                        ? fragments[selection.name.value]
                        : selection;
                if (fragment && fragment.selectionSet) {
                    const result = this.traverseASTNode(fragment.selectionSet, fragments, variables, depth);
                    Object.assign(prismaSelect, result.prismaSelect);
                    if (result.transformPlan) {
                        Object.assign(transformPlan, result.transformPlan);
                        hasDirectivesInTree = true;
                    }
                }
                continue;
            }

            // 2. 处理标准字段
            if (selection.kind === 'Field') {
                const fieldName = selection.name.value;

                // 解析字段参数
                const args = this.getArgsFromAST(selection.arguments, variables);
                const validatedArgs = this.securityPolicy.validateArguments(args);

                // 解析指令及其参数
                const directiveConfigs =
                    selection.directives?.map((d) => ({
                        name: d.name.value,
                        args: this.getArgsFromAST(d.arguments, variables) || {},
                    })) || [];

                if (selection.selectionSet) {
                    // 递归处理嵌套
                    const subResult = this.traverseASTNode(
                        selection.selectionSet,
                        fragments,
                        variables,
                        depth + 1
                    );

                    prismaSelect[fieldName] = {
                        select: subResult.prismaSelect,
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
                    // 叶子节点
                    prismaSelect[fieldName] = true;
                    if (directiveConfigs.length > 0) {
                        transformPlan[fieldName] = { directives: directiveConfigs };
                        hasDirectivesInTree = true;
                    }
                }
            }
        }

        return {
            prismaSelect,
            transformPlan: hasDirectivesInTree ? transformPlan : null,
        };
    }

    /**
     * 解析入口方法
     */
    extract(info: any, variables: any = {}): ParseResult {
        const { fieldNodes, fragments } = info;
        if (!fieldNodes || fieldNodes.length === 0) {
            return { prismaSelect: undefined, transformPlan: null };
        }
        return this.traverseASTNode(fieldNodes[0].selectionSet, fragments, variables, 0);
    }
}
