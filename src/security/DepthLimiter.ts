import { SecurityPolicy } from './SecurityPolicy';
import { FieldNode, SelectionSetNode, FragmentDefinitionNode } from 'graphql';

/**
 * DepthLimiter 可作为一个专门遍历 AST，提前拦截深度超限查询的中间件或工具类。
 * 也可以在 Extractor 提取信息的过程中结合 SecurityPolicy 共同使用。
 */
export class DepthLimiter {
    private policy: SecurityPolicy;

    constructor(policy: SecurityPolicy) {
        this.policy = policy;
    }

    /**
     * 提前验证某个查询节点的深度是否合法
     */
    validateDepth(
        node: FieldNode,
        fragments: Record<string, FragmentDefinitionNode>
    ): boolean {
        try {
            this.checkNodeDepth(node, fragments, 0);
            return true;
        } catch (e) {
            if (e instanceof Error && e.message.includes('[Security Violation]')) {
                // 如果 options 设置了抛出异常，这里会拦截并返回 false，或直接上抛
                throw e;
            }
            return false; // 如果配置了不抛异常，在内部计算超过深度会默默返回 false
        }
    }

    private checkNodeDepth(
        node: any,
        fragments: Record<string, FragmentDefinitionNode>,
        currentDepth: number
    ): void {
        if (currentDepth >= this.policy.getMaxDepth()) {
            this.policy.checkDepth(currentDepth);
            // 如果没有抛出抛异常，则强制抛出以停止解析（专门在深度验证逻辑中）
            throw new Error(`[Security Violation] Query depth limit reached (${this.policy.getMaxDepth()})`);
        }

        if (!node.selectionSet) return;

        for (const selection of (node.selectionSet as SelectionSetNode).selections) {
            if (selection.kind === 'Field') {
                this.checkNodeDepth(selection, fragments, currentDepth + 1);
            } else if (selection.kind === 'FragmentSpread') {
                const fragment = fragments[selection.name.value];
                if (fragment) {
                    this.checkNodeDepth(fragment, fragments, currentDepth); // spread 本身不增加深度，里面的 field 增加
                }
            } else if (selection.kind === 'InlineFragment') {
                this.checkNodeDepth(selection, fragments, currentDepth);
            }
        }
    }
}
