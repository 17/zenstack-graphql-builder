import { GraphQLType } from 'graphql';

/**
 * TypeCache 统一管理在生成 GraphQL Schema 过程中的所有类型。
 * 由于 GraphQL Schema 中存在大量相互引用的类型（如 User -> Post -> User...），
 * 使用缓存可以避免重复构建和死循环栈溢出。
 */
export class TypeCache {
    private cache: Map<string, GraphQLType>;

    constructor() {
        this.cache = new Map();
    }

    /**
     * 判断缓存中是否包含指定名称的类型
     * @param name 类型名称
     * @returns boolean
     */
    has(name: string): boolean {
        return this.cache.has(name);
    }

    /**
     * 获取缓存中的类型
     * @param name 类型名称
     * @returns GraphQLType | undefined
     */
    get<T extends GraphQLType = GraphQLType>(name: string): T | undefined {
        return this.cache.get(name) as T | undefined;
    }

    /**
     * 将类型存入缓存
     * @param name 类型名称
     * @param type GraphQLType 实例
     */
    set(name: string, type: GraphQLType): void {
        if (this.cache.has(name)) {
            return
            // console.warn(`[TypeCache] Type "${name}" is already cached. Overwriting.`);
        }
        this.cache.set(name, type);
    }

    /**
     * 获取所有缓存的类型数组，通常用于传入 GraphQLSchema 的 types 属性中
     * @returns GraphQLType[]
     */
    values(): GraphQLType[] {
        return Array.from(this.cache.values());
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
    }
}
