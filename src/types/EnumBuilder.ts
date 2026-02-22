import { GraphQLEnumType } from 'graphql';
import { TypeCache } from './TypeCache';

/**
 * EnumBuilder 负责从 ZenStack Schema 中的枚举定义构建对应的 GraphQLEnumType 并缓存。
 */
export class EnumBuilder {
    private typeCache: TypeCache;

    constructor(typeCache: TypeCache) {
        this.typeCache = typeCache;
    }

    /**
     * 构建并在缓存中注册枚举类型
     * @param zenSchema ZenStack SchemaDef 包含的 enums 定义
     */
    buildEnums(zenSchema: any): void {
        if (!zenSchema.enums) return;
        for (const [name, def] of Object.entries(zenSchema.enums)) {
            if (typeof def !== 'object' || def === null) continue;

            const values = Object.keys(def).reduce(
                (acc, key) => ({ ...acc, [key]: { value: key } }),
                {}
            );

            const enumType = new GraphQLEnumType({ name, values });
            this.typeCache.set(name, enumType);
        }
    }
}
