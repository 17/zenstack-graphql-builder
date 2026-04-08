import { enumerate, invariant, lowerCaseFirst } from '@zenstackhq/common-helpers';
import { ZenStackClient, QueryUtils } from '@zenstackhq/orm';

import {
    type AttributeApplication,
    type BuiltinType,
    type FieldDef,
    type GetModels,
    type SchemaDef,
} from '@zenstackhq/schema';

import {
    type ClientContract,
    type ClientOptions,
    type ExtQueryArgsBase,
    type CoreCrudOperations,
    type RuntimePlugin,
    CoreCrudOperations as AllCrudOperations,
    CoreReadOperations as AllReadOperations,
    CoreWriteOperations as AllWriteOperations
} from '@zenstackhq/orm';

import {
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLString,
    GraphQLUnionType,
    GraphQLScalarType,
    GraphQLFloat,
    GraphQLInputType,
    GraphQLOutputType,
    GraphQLNamedType,
    GraphQLFieldConfig,
    GraphQLInputFieldConfigMap,
    GraphQLObjectTypeConfig,
    GraphQLInputObjectTypeConfig,
    GraphQLEnumValueConfigMap,
} from 'graphql';
import Decimal from 'decimal.js';

/**
 * The types of fields that are numeric.
 */
export const NUMERIC_FIELD_TYPES = ['Int', 'Float', 'BigInt', 'Decimal'];

/**
 * Logical combinators used in filters.
 */
export const LOGICAL_COMBINATORS = ['AND', 'OR', 'NOT'] as const;

/**
 * Aggregation operators.
 */
export const AggregateOperators = ['_count', '_sum', '_avg', '_min', '_max'] as const;
export type AggregateOperators = (typeof AggregateOperators)[number];

/**
 * Mapping of filter operators to their corresponding filter kind categories.
 */
export const FILTER_PROPERTY_TO_KIND = {
    // Equality operators
    equals: 'Equality',
    not: 'Equality',
    in: 'Equality',
    notIn: 'Equality',

    // Range operators
    lt: 'Range',
    lte: 'Range',
    gt: 'Range',
    gte: 'Range',
    between: 'Range',

    // Like operators
    contains: 'Like',
    startsWith: 'Like',
    endsWith: 'Like',
    mode: 'Like',

    // Relation operators
    is: 'Relation',
    isNot: 'Relation',
    some: 'Relation',
    every: 'Relation',
    none: 'Relation',

    // Json operators
    path: 'Json',
    string_contains: 'Json',
    string_starts_with: 'Json',
    string_ends_with: 'Json',
    array_contains: 'Json',
    array_starts_with: 'Json',
    array_ends_with: 'Json',

    // List operators
    has: 'List',
    hasEvery: 'List',
    hasSome: 'List',
    isEmpty: 'List',
} as const;

/**
 * Mapping of filter operators to their corresponding filter kind categories.
 */
export type FilterPropertyToKind = typeof FILTER_PROPERTY_TO_KIND;

export const allFilterKinds = [...new Set(Object.values(FILTER_PROPERTY_TO_KIND))];

export function extractFields(obj: any, fields: readonly string[]) {
    return Object.fromEntries(Object.entries(obj).filter(([key]) => fields.includes(key)));
}

const {
    fieldHasDefaultValue,
    getEnum,
    getTypeDef,
    getUniqueFields,
    isEnum,
    isTypeDef,
    requireField,
    requireModel,
} = QueryUtils

// 简单的缓存装饰器实现
function cache(): any {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (this: any, ...args: any[]) {
            const cacheKey = `${propertyKey}:${JSON.stringify(Array.from({ length: originalMethod.length }, (v, i) => args[i] ?? undefined))}`;
            if (!this._cache) this._cache = new Map();
            if (this._cache.has(cacheKey)) {
                return this._cache.get(cacheKey);
            }
            const result = originalMethod.apply(this, args);
            this._cache.set(cacheKey, result);
            return result;
        };
        return descriptor;
    };
}

/**
 * Minimal field information needed for filter schema generation.
 */
type FieldInfo = {
    name: string;
    type: string;
    optional?: boolean;
    array?: boolean;
};

function toFieldInfo(def: FieldDef): FieldInfo {
    return {
        name: def.name,
        type: def.type,
        optional: def.optional,
        array: def.array,
    };
}


/**
 * Options for creating Zod schemas.
 */
export type CreateSchemaOptions = {
    /**
     * Controls the depth of relation nesting in the generated schema. Default is unlimited.
     */
    relationDepth?: number;
};


export class GraphQLTypeFactory<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema> = ClientOptions<Schema>,
    ExtQueryArgs extends ExtQueryArgsBase = {},
> {
    readonly schema: Schema;
    readonly options: Options;
    readonly scalars: any;
    readonly _cache = new Map<string, any>();

    constructor(client: ClientContract<Schema, Options, ExtQueryArgs, any>, scalars: any);
    constructor(schema: Schema, scalars: any, options?: Options);
    constructor(clientOrSchema: any, scalars: any, options?: Options) {
        if ('$schema' in clientOrSchema) {
            this.schema = clientOrSchema.$schema;
            this.options = clientOrSchema.$options;
        } else {
            this.schema = clientOrSchema;
            this.options = options || ({} as Options);
        }
        this.scalars = scalars;
    }

    private get plugins(): RuntimePlugin<Schema, any, any, any>[] {
        return this.options.plugins ?? [];
    }


    private getModelFields(model: string): [string, FieldDef][] {
        const modelDef = requireModel(this.schema, model);
        return Object.entries(modelDef.fields).filter(([, def]) => def.type !== 'Unsupported');
    }

    private shouldIncludeRelations(options?: CreateSchemaOptions): boolean {
        return options?.relationDepth === undefined || options.relationDepth > 0;
    }

    private isModelAllowed(targetModel: string): boolean {
        const slicing = this.options.slicing;
        if (!slicing) {
            return true; // No slicing, all models allowed
        }

        const { includedModels, excludedModels } = slicing;

        // If includedModels is specified, only those models are allowed
        if (includedModels !== undefined) {
            if (!includedModels.includes(targetModel as any)) {
                return false;
            }
        }

        // If excludedModels is specified, those models are not allowed
        if (excludedModels !== undefined) {
            if (excludedModels.includes(targetModel as any)) {
                return false;
            }
        }

        return true;
    }

    private isTypeDefType(type: string) {
        return this.schema.typeDefs && type in this.schema.typeDefs;
    }


    private nextOptions(options?: CreateSchemaOptions): CreateSchemaOptions | undefined {
        if (!options) return undefined;
        if (options.relationDepth === undefined) return options;
        return { ...options, relationDepth: options.relationDepth - 1 };
    }

    private addExtResultFields(model: string, fields: GraphQLInputFieldConfigMap) {
        for (const plugin of this.plugins) {
            const resultConfig = plugin.result;
            if (resultConfig) {
                const modelConfig = resultConfig[lowerCaseFirst(model)];
                if (modelConfig) {
                    for (const field of Object.keys(modelConfig)) {
                        fields[field] = { type: GraphQLBoolean };
                    }
                }
            }
        }
    }

    private internalMakeArrayFilterType(contextModel: string | undefined, field: string, elementType: GraphQLInputType): GraphQLInputObjectType {
        const fields: GraphQLInputFieldConfigMap = {
            equals: { type: new GraphQLList(elementType) },
            has: { type: elementType },
            hasEvery: { type: new GraphQLList(elementType) },
            hasSome: { type: new GraphQLList(elementType) },
            isEmpty: { type: GraphQLBoolean },
        };

        const allowedKinds = this.getEffectiveFilterKinds(contextModel, field);
        const filteredOperators = this.trimFilterOperators(fields, allowedKinds);

        return new GraphQLInputObjectType({
            name: `${contextModel ? lowerCaseFirst(contextModel) : ''}${field}ArrayFilterInput`,
            fields: filteredOperators,
        });
    }


    private isNumericField(fieldDef: FieldDef) {
        return NUMERIC_FIELD_TYPES.includes(fieldDef.type) && !fieldDef.array;
    }

    private get providerSupportsCaseSensitivity() {
        return this.schema.provider.type === 'postgresql';
    }

    private get providerSupportsDistinct() {
        return ['sqlite', 'mysql'].includes(this.schema.provider.type);
    }

    getEffectiveFilterKinds(model: string | undefined, field: string): string[] | undefined {
        if (!model) {
            return undefined;
        }

        const slicing = this.options.slicing;
        if (!slicing?.models) {
            return undefined;
        }

        type FieldConfig = { includedFilterKinds?: readonly string[]; excludedFilterKinds?: readonly string[] };
        type FieldsRecord = { $all?: FieldConfig } & Record<string, FieldConfig>;
        type ModelConfig = { fields?: FieldsRecord };
        const modelsRecord = slicing.models as Record<string, ModelConfig>;

        const modelConfig = modelsRecord[lowerCaseFirst(model)];
        if (modelConfig?.fields) {
            const fieldConfig = modelConfig.fields[field];
            if (fieldConfig) {
                return this.computekinds(fieldConfig.includedFilterKinds, fieldConfig.excludedFilterKinds, allFilterKinds);
            }

            const allFieldsConfig = modelConfig.fields['$all'];
            if (allFieldsConfig) {
                return this.computekinds(
                    allFieldsConfig.includedFilterKinds,
                    allFieldsConfig.excludedFilterKinds,
                    allFilterKinds,
                );
            }
        }

        const allModelsConfig = modelsRecord['$all'];
        if (allModelsConfig?.fields) {
            const allModelsFieldConfig = allModelsConfig.fields[field];
            if (allModelsFieldConfig) {
                return this.computekinds(
                    allModelsFieldConfig.includedFilterKinds,
                    allModelsFieldConfig.excludedFilterKinds,
                    allFilterKinds,
                );
            }

            const allModelsAllFieldsConfig = allModelsConfig.fields['$all'];
            if (allModelsAllFieldsConfig) {
                return this.computekinds(
                    allModelsAllFieldsConfig.includedFilterKinds,
                    allModelsAllFieldsConfig.excludedFilterKinds,
                    allFilterKinds
                );
            }
        }

        return undefined;
    }

    getEffectiveModel(): string[] | undefined | readonly string[] {
        const slicing = this.options.slicing;
        const models = Object.keys(this.schema.models);
        if (!slicing) {
            return models;
        }
        return this.computekinds(slicing.includedModels, slicing.excludedModels, models);
    }

    getEffectiveOperations(model: string | undefined): string[] | undefined | readonly string[] {
        const slicing = this.options.slicing;
        if (!slicing?.models) {
            return AllCrudOperations;
        }
        const modelsRecord = slicing.models;
        const modelConfig = modelsRecord[lowerCaseFirst(model)];
        if (modelConfig) {
            return this.computekinds(modelConfig.includedOperations, modelConfig.excludedOperations, AllCrudOperations);
        }
        const allmodelsConfig = modelsRecord['$all'];
        if (allmodelsConfig) {
            return this.computekinds(
                allmodelsConfig.includedOperations,
                allmodelsConfig.excludedOperations,
                AllCrudOperations,
            );
        }
        return AllCrudOperations;
    }

    computekinds(included: readonly string[] | undefined, excluded: readonly string[] | undefined, kinds: readonly string[] | undefined): string[] | undefined {
        let result: string[] | undefined;
        if (included !== undefined) {
            result = [...included];
        }
        if (excluded !== undefined) {
            if (!result) {
                result = [...kinds];
            }
            for (const kind of excluded) {
                result = result.filter((k) => k !== kind);
            }
        }
        return result;
    }

    private trimFilterOperators<T extends Record<string, any>>(
        operators: T,
        allowedKinds: string[] | undefined,
    ): Partial<T> {
        if (!allowedKinds) {
            return operators; // No restrictions
        }

        return Object.fromEntries(
            Object.entries(operators).filter(([key, _]) => {
                return (
                    !(key in FILTER_PROPERTY_TO_KIND) ||
                    allowedKinds.includes(FILTER_PROPERTY_TO_KIND[key as keyof typeof FILTER_PROPERTY_TO_KIND])
                );
            }),
        ) as Partial<T>;
    }

    // @cache()
    // private createFilterType(
    //     valueType: any,
    //     optional: boolean,
    //     components: GraphQLInputFieldConfigMap | (() => GraphQLInputFieldConfigMap),
    // ): GraphQLInputObjectType {
    //     const name = optional ? `${valueType.name}OptionalFilter` : `${valueType.name}Filter`;
    //     if (valueType == 'String') {
    //         console.log(name, components.toString());
    //     }
    //     return new GraphQLInputObjectType({
    //         name: name,
    //         fields: components,
    //     })
    // }

    @cache()
    private makeStringModeType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: 'StringMode',
            values: { default: { value: 'default' }, insensitive: { value: 'insensitive' } },
        });
    }

    @cache()
    private makeSortOrderType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: 'SortOrder',
            values: { asc: { value: 'asc' }, desc: { value: 'desc' } },
        });
    }

    @cache()
    private makeNullsOrderType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: 'NullsOrder',
            values: { first: { value: 'first' }, last: { value: 'last' } },
        })
    }

    @cache()
    private makeOrderByInputType(): GraphQLInputObjectType {
        return new GraphQLInputObjectType({
            name: 'OrderByInput',
            fields: {
                sort: { type: this.makeSortOrderType() },
                nulls: { type: this.makeNullsOrderType() },
            },
        })
    }

    @cache()
    private makeScalarType(type: string, array: boolean = false, optional: Boolean = true): GraphQLInputType {
        let baseType: GraphQLInputType;
        if (this.schema.typeDefs && type in this.schema.typeDefs) {
            baseType = new GraphQLScalarType({ name: `${type}Scalar`, serialize: v => v, parseValue: v => v });
        } else if (this.schema.enums && type in this.schema.enums) {
            baseType = this.makeEnumType(type);
        } else {
            baseType = this.scalars[type] || GraphQLString;
        }

        let wrappedType = optional ? baseType : new GraphQLNonNull(baseType);
        return array ? new GraphQLList(wrappedType) : wrappedType;
    }

    @cache()
    private makePrimitiveFilterType(
        contextModel: string | undefined,
        fieldDef: FieldDef,
        withAggregations: boolean,
        ignoreSlicing = false,
    ): GraphQLInputObjectType | GraphQLScalarType {
        const type = fieldDef.type as BuiltinType;
        const optional = !!fieldDef.optional;
        // return this.makeScalarType('Json');
        // 添加裁切过滤器
        const allowedFilterKinds = ignoreSlicing
            ? undefined
            : this.getEffectiveFilterKinds(contextModel, fieldDef.name);
        switch (type) {
            case 'String': return this.makeStringFilterType(withAggregations);
            case 'Int':
            case 'Float':
            case 'Decimal':
            case 'BigInt':
                return this.makeNumberFilterType(withAggregations);
            case 'Boolean': return this.makeBooleanFilterType(withAggregations);
            case 'DateTime': return this.makeDateTimeFilterType(withAggregations);
            case 'Bytes': return this.makeBytesFilterType(withAggregations);
            case 'Json': return this.makeJsonFilterType(contextModel, fieldDef.name);
            default: return new GraphQLInputObjectType({ name: 'UnknownFilter', fields: {} });
        }
    }


    @cache()
    private makeArrayFilterType(model: string | undefined, fieldDef: FieldDef): GraphQLInputObjectType {
        return this.internalMakeArrayFilterType(model, fieldDef.name, this.makeScalarType(fieldDef.type as BuiltinType));
    }

    @cache()
    private makeTypedJsonFilterType(model: string | undefined, fieldInfo: FieldInfo): GraphQLInputObjectType {
        const field = fieldInfo.name;
        const type = fieldInfo.type;
        const optional = !!fieldInfo.optional;
        const array = !!fieldInfo.array;

        const typeDef = getTypeDef(this.schema, type);
        invariant(typeDef, `Type definition "${type}" not found in schema`);

        const fields: GraphQLInputFieldConfigMap = {};

        if (!array) {
            for (const [fieldName, fieldDef] of Object.entries(typeDef.fields)) {
                if (this.isTypeDefType(fieldDef.type)) {
                    fields[fieldName] = { type: this.makeTypedJsonFilterType(model, fieldDef) };
                } else {
                    const enumDef = getEnum(this.schema, fieldDef.type);
                    if (enumDef) {
                        fields[fieldName] = { type: this.makeEnumFilterType(model, fieldDef, false) };
                    } else if (fieldDef.array) {
                        fields[fieldName] = { type: this.makeArrayFilterType(model, fieldDef) };
                    } else {
                        fields[fieldName] = { type: this.makePrimitiveFilterType(model, fieldDef, false) };
                    }
                }
            }
        }

        if (array) {
            const recursiveType = this.makeTypedJsonFilterType(model, { name: field, type, optional, array: false });
            fields['some'] = { type: recursiveType };
            fields['every'] = { type: recursiveType };
            fields['none'] = { type: recursiveType };
        } else {
            const recursiveType = this.makeTypedJsonFilterType(model, { name: field, type, optional, array: false });
            fields['is'] = { type: recursiveType };
            fields['isNot'] = { type: recursiveType };
        }

        // 添加 plain json filter
        const jsonFilter = this.makeJsonFilterType(model, field);
        // GraphQL 输入不支持联合，这里简单合并字段（有些字段可能重复，但 GraphQL 允许字段名唯一）
        // 实际使用中，客户端需要明确使用对象形式，不能直接使用标量值。
        // 为了简化，我们直接返回一个对象类型，包含所有可能的字段，用户必须使用对象。
        // 并且我们移除了直接标量值的支持。
        const allFields = { ...fields, ...jsonFilter.getFields() };
        return new GraphQLInputObjectType({
            name: `${model ? lowerCaseFirst(model) : 'Typed'}${field}JsonFilterInput`,
            fields: allFields,
        });
    }

    @cache()
    private makeJsonFilterType(contextModel: string | undefined, field: string): GraphQLInputObjectType {
        const valueType = this.makeScalarType('Json');
        const fields: GraphQLInputFieldConfigMap = {
            path: { type: GraphQLString },
            equals: { type: valueType },
            not: { type: valueType },
            string_contains: { type: GraphQLString },
            string_starts_with: { type: GraphQLString },
            string_ends_with: { type: GraphQLString },
            mode: { type: this.makeStringModeType() },
            array_contains: { type: valueType },
            array_starts_with: { type: valueType },
            array_ends_with: { type: valueType },
        };
        return new GraphQLInputObjectType({
            name: `${contextModel ? lowerCaseFirst(contextModel) : ''}${field}JsonFilterInput`,
            fields,
        });
    }

    @cache()
    private makeDateTimeFilterType(withAggregations: boolean): GraphQLInputObjectType {
        const baseType = GraphQLString;
        const components = () => this.makeCommonPrimitiveFilterComponents('DateTime', baseType, () => this.makeDateTimeFilterType(withAggregations), undefined, withAggregations ? ['_count', '_min', '_max'] : undefined);
        return new GraphQLInputObjectType({
            name: `DateTime${withAggregations ? 'Agg' : ''}Filter`,
            fields: components,
        })
    }

    @cache()
    private makeBooleanFilterType(withAggregations: boolean): GraphQLInputObjectType {
        const baseType = GraphQLBoolean;
        const components = () => this.makeCommonPrimitiveFilterComponents('Boolean', baseType, () => this.makeBooleanFilterType(withAggregations), ['equals', 'not'], withAggregations ? ['_count', '_min', '_max'] : undefined);
        return new GraphQLInputObjectType({
            name: `Boolean${withAggregations ? 'Agg' : ''}Filter`,
            fields: components,
        })
    }

    @cache()
    private makeBytesFilterType(withAggregations: boolean): GraphQLInputObjectType {
        const baseType = GraphQLString;
        const components = () => this.makeCommonPrimitiveFilterComponents('Bytes', baseType, () => this.makeBytesFilterType(withAggregations), ['equals', 'in', 'notIn', 'not'], withAggregations ? ['_count', '_min', '_max'] : undefined);
        return new GraphQLInputObjectType({
            name: `Bytes${withAggregations ? 'Agg' : ''}Filter`,
            fields: components,
        })
    }

    @cache()
    private makeNumberFilterType(withAggregations: boolean): GraphQLInputObjectType {
        const baseType = GraphQLInt;
        const components = () => this.makeCommonPrimitiveFilterComponents('Number', baseType, () => this.makeNumberFilterType(withAggregations), undefined, withAggregations ? ['_count', '_avg', '_sum', '_min', '_max'] : undefined);
        return new GraphQLInputObjectType({
            name: `Number${withAggregations ? 'Agg' : ''}Filter`,
            fields: components,
        })
    }

    @cache()
    private makeStringFilterType(withAggregations: boolean): GraphQLInputObjectType {
        const baseType = GraphQLString;
        const baseComponents = () => this.makeCommonPrimitiveFilterComponents('String', baseType, () => this.makeStringFilterType(withAggregations), undefined, withAggregations ? ['_count', '_min', '_max'] : undefined);
        const stringSpecific: GraphQLInputFieldConfigMap = {
            startsWith: { type: GraphQLString },
            endsWith: { type: GraphQLString },
            contains: { type: GraphQLString },
        };
        if (this.providerSupportsCaseSensitivity) {
            stringSpecific['mode'] = { type: this.makeStringModeType() };
        }
        const allComponents = () => ({ ...baseComponents(), ...stringSpecific });
        return new GraphQLInputObjectType({
            name: `String${withAggregations ? 'Agg' : ''}Filter`,
            fields: allComponents,
        })
    }

    @cache()
    private makeEnumFilterType(model: string | undefined, fieldDef: FieldDef, withAggregations: boolean, ignoreSlicing: boolean = false): GraphQLInputObjectType {
        const enumName = fieldDef.type;
        const optional = !!fieldDef.optional;
        const array = !!fieldDef.array;
        const enumType = this.makeEnumType(enumName);
        const baseType = enumType;
        if (array) {
            return this.internalMakeArrayFilterType(model, fieldDef.name, baseType);
        }
        const components = () => this.makeCommonPrimitiveFilterComponents('Enum', baseType, () => this.makeEnumFilterType(model, fieldDef, withAggregations), ['equals', 'in', 'notIn', 'not'], withAggregations ? ['_count', '_min', '_max'] : undefined);
        return new GraphQLInputObjectType({
            name: `${enumName}EnumFilter`,
            fields: components,
        })
    }

    @cache()
    private makeCommonPrimitiveFilterType(
        name: string,
        baseType: GraphQLInputType,
        // optional: boolean,
        makeThis: () => GraphQLInputObjectType,
        withAggregations: Array<AggregateOperators> | undefined = undefined,
    ): GraphQLInputObjectType {
        const components = () => this.makeCommonPrimitiveFilterComponents(name, baseType, makeThis, undefined, withAggregations);
        return new GraphQLInputObjectType({
            name: `${name}${withAggregations ? 'Agg' : ''}CommonInputFilter`,
            fields: components,
        })
    }

    private makeCommonPrimitiveFilterComponents(
        name: string,
        baseType: GraphQLInputType,
        // optional: boolean,
        makeThis: () => GraphQLInputObjectType,
        supportedOperators: string[] | undefined = undefined,
        withAggregations: Array<'_count' | '_avg' | '_sum' | '_min' | '_max'> | undefined = undefined,
    ): GraphQLInputFieldConfigMap {
        let result: GraphQLInputFieldConfigMap = {
            equals: { type: baseType },
            in: { type: new GraphQLList(baseType) },
            notIn: { type: new GraphQLList(baseType) },
            lt: { type: baseType },
            lte: { type: baseType },
            gt: { type: baseType },
            gte: { type: baseType },
            between: { type: new GraphQLList(baseType) },
            not: { type: makeThis() },
        };

        if (withAggregations?.includes('_count')) result['_count'] = { type: this.makeNumberFilterType(false) };

        if (withAggregations && withAggregations.length > 0) {
            const aggFields = ['_avg', '_sum', '_min', '_max'].filter(agg => withAggregations.includes(agg as any));
            if (aggFields.length > 0) {
                const aggType = this.makeCommonPrimitiveFilterType(name, baseType, makeThis, undefined);
                for (const agg of aggFields) {
                    result[agg] = { type: aggType };
                }
            }
        }

        if (supportedOperators) {
            const keys = [...supportedOperators, ...(withAggregations ?? [])];
            result = extractFields(result, keys) as typeof result;
        }

        // TODO: 补充过滤器
        return result;
    }

    @cache()
    private makeEnumType(_enum: string): GraphQLEnumType {
        const enumDef = getEnum(this.schema, _enum);
        invariant(enumDef, `Enum "${_enum}" not found in schema`);
        const values: GraphQLEnumValueConfigMap = {};
        for (const key of Object.keys(enumDef.values)) {
            values[key] = { value: key };
        }
        return new GraphQLEnumType({ name: _enum, values });
    }

    @cache()
    private makeOmitType(model: string): GraphQLInputObjectType {
        const fields: GraphQLInputFieldConfigMap = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (!fieldDef.relation) {
                if (this.options.allowQueryTimeOmitOverride !== false) {
                    fields[field] = { type: GraphQLBoolean };
                } else {
                    fields[field] = { type: new GraphQLNonNull(GraphQLBoolean) };
                }
            }
        }
        this.addExtResultFields(model, fields);
        return new GraphQLInputObjectType({
            name: `${model}OmitInput`,
            fields,
        });
    }


    @cache()
    private makeTypeDefType(type: string): GraphQLInputObjectType {
        const typeDef = getTypeDef(this.schema, type);
        invariant(typeDef, `Type definition "${type}" not found in schema`);
        const fields: GraphQLInputFieldConfigMap = {};
        for (const [field, def] of Object.entries(typeDef.fields)) {
            let fieldType: GraphQLInputType = this.makeScalarType(def.type);
            if (def.array) fieldType = new GraphQLList(fieldType);
            if (def.optional) fieldType = fieldType; // GraphQL 默认是可空的，不需要包装
            fields[field] = { type: fieldType };
        }
        return new GraphQLInputObjectType({
            name: `${type}Input`,
            fields,
        });
    }


    @cache()
    private makeSelectType(model: string, options?: CreateSchemaOptions): GraphQLInputObjectType {
        const fields: GraphQLInputFieldConfigMap = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (fieldDef.relation) {
                if (!this.shouldIncludeRelations(options)) continue;
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = { type: this.makeRelationSelectIncludeType(model, field, options) };
                }
            } else {
                fields[field] = { type: GraphQLBoolean };
            }
        }
        if (this.shouldIncludeRelations(options)) {
            const countSchema = this.makeCountSelectionType(model, options);
            if (countSchema) fields['_count'] = { type: countSchema };
        }
        this.addExtResultFields(model, fields);
        return new GraphQLInputObjectType({
            name: `${model}SelectInput`,
            fields,
        });
    }

    @cache()
    private makeIncludeType(model: string, options?: CreateSchemaOptions): GraphQLInputObjectType {
        const modelDef = requireModel(this.schema, model);
        const fields: GraphQLInputFieldConfigMap = {};
        for (const field of Object.keys(modelDef.fields)) {
            const fieldDef = requireField(this.schema, model, field);
            if (fieldDef.relation) {
                if (!this.shouldIncludeRelations(options)) continue;
                if (this.isModelAllowed(fieldDef.type)) {
                    fields[field] = { type: this.makeRelationSelectIncludeType(model, field, options) };
                }
            }
        }
        if (this.shouldIncludeRelations(options)) {
            const countSchema = this.makeCountSelectionType(model, options);
            if (countSchema) fields['_count'] = { type: countSchema };
        }
        return new GraphQLInputObjectType({
            name: `${model}IncludeInput`,
            fields,
        });
    }

    @cache()
    private makeCountSelectionType(model: string, options?: CreateSchemaOptions): GraphQLInputObjectType | null {
        const modelDef = requireModel(this.schema, model);
        const toManyRelations = Object.values(modelDef.fields).filter((def: any) => def.relation && def.array);
        if (toManyRelations.length === 0) return null;
        const nextOpts = this.nextOptions(options);
        const selectFields: GraphQLInputFieldConfigMap = {};
        for (const fieldDef of toManyRelations) {
            const where = this.makeWhereType(fieldDef.type, false, false, false, nextOpts);
            selectFields[fieldDef.name] = {
                type: new GraphQLInputObjectType({
                    name: `${model}CountSelect${fieldDef.name}Input`,
                    fields: {
                        where: { type: where },
                    },
                }),
            };
        }
        return new GraphQLInputObjectType({
            name: `${model}CountSelectInput`,
            fields: {
                select: { type: new GraphQLInputObjectType({ name: `${model}CountSelectSelectInput`, fields: selectFields }) },
            },
        });
    }

    @cache()
    private makeRelationSelectIncludeType(model: string, field: string, options?: CreateSchemaOptions): GraphQLInputObjectType {
        const fieldDef = requireField(this.schema, model, field);
        const nextOpts = this.nextOptions(options);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {};
            if (fieldDef.array || fieldDef.optional) {
                result['where'] = { type: this.makeWhereType(fieldDef.type, false, false, false, nextOpts) };
            }
            result['select'] = { type: this.makeSelectType(fieldDef.type, nextOpts) };
            result['include'] = { type: this.makeIncludeType(fieldDef.type, nextOpts) };
            result['omit'] = { type: this.makeOmitType(fieldDef.type) };
            if (fieldDef.array) {
                result['orderBy'] = { type: new GraphQLList(this.makeOrderByType(fieldDef.type, true, false, nextOpts)) };
                result['skip'] = { type: GraphQLInt };
                result['take'] = { type: GraphQLInt };
                result['cursor'] = { type: this.makeCursorType(fieldDef.type, nextOpts) };
                if (!this.providerSupportsDistinct) {
                    result['distinct'] = { type: this.makeDistinctType(fieldDef.type) };
                }
            }
            return result;
        };

        return new GraphQLInputObjectType({
            name: `${model}${field}SelectIncludeInput`,
            fields,
        });
    }

    @cache()
    private makeOrderByType(
        model: string,
        withRelation: boolean,
        withAggregation: boolean,
        options?: CreateSchemaOptions,
    ): GraphQLInputObjectType {
        const typeName = `${model}${withRelation ? 'WithRelation' : 'WithoutRelation'}${withAggregation ? 'WithAggregations' : ''}Input`;
        const sortEnum = this.makeSortOrderType();
        const nextOpts = this.nextOptions(options);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {};

            for (const [field, fieldDef] of this.getModelFields(model)) {
                if (fieldDef.relation) {
                    if (withRelation && this.shouldIncludeRelations(options)) {
                        if (fieldDef.array) {
                            const relationOrderBy = this.makeOrderByType(fieldDef.type, withRelation, withAggregation, nextOpts);
                            const extended = new GraphQLInputObjectType({
                                name: `${model}${field}OrderByWithRelationInput`,
                                fields: () => ({
                                    ...relationOrderBy.getFields(),
                                    _count: { type: sortEnum },
                                }),
                            });
                            result[field] = { type: extended };
                        } else {
                            result[field] = { type: this.makeOrderByType(fieldDef.type, withRelation, withAggregation, nextOpts) };
                        }
                    }
                } else {
                    if (fieldDef.optional) {
                        result[field] = {
                            type: this.makeOrderByInputType(),
                        };
                    } else {
                        result[field] = { type: sortEnum };
                    }
                }
            }

            if (withAggregation) {
                const aggFields = ['_count', '_avg', '_sum', '_min', '_max'];
                for (const agg of aggFields) {
                    result[agg] = { type: this.makeOrderByType(model, true, false, options) };
                }
            }

            return result;
        };

        const type = new GraphQLInputObjectType({
            name: typeName,
            fields,
        });

        return type;
    }

    @cache()
    private makeDistinctType(model: string): GraphQLList<GraphQLEnumType | GraphQLScalarType> {
        const nonRelationFields = this.getModelFields(model)
            .filter(([, def]) => !def.relation)
            .map(([name]) => name);
        if (nonRelationFields.length === 0) return new GraphQLList(GraphQLString);
        const enumType = new GraphQLEnumType({
            name: `${model}DistinctField`,
            values: Object.fromEntries(nonRelationFields.map(f => [f, { value: f }])),
        });
        return new GraphQLList(enumType);
    }

    private makeCursorType(model: string, options?: CreateSchemaOptions): GraphQLInputObjectType {
        return this.makeWhereType(model, true, true, false, options);
    }

    @cache()
    private relationFilter(model: string, field: string, nextOpts?: CreateSchemaOptions) {
        let fieldType
        const relationFilterTypeName = `${model}${field}RelationFilter`;
        const fieldDef = requireField(this.schema, model, field)
        // const nextOpts = this.nextOptions(options);

        if (fieldDef.array) {
            fieldType = new GraphQLInputObjectType({
                name: relationFilterTypeName,
                fields: () => {
                    const relWhere = this.makeWhereType(fieldDef.type, false, false, false, nextOpts);
                    return {
                        some: { type: relWhere },
                        every: { type: relWhere },
                        none: { type: relWhere },
                    };
                },
            });
        } else {
            fieldType = new GraphQLInputObjectType({
                name: relationFilterTypeName,
                fields: () => {
                    const relWhere = this.makeWhereType(fieldDef.type, false, false, false, nextOpts);
                    return {
                        is: { type: relWhere },
                        isNot: { type: relWhere },
                    };
                },
            });
        }
        return fieldType
    }


    @cache()
    private makeWhereType(
        model: string,
        unique: boolean,
        withoutRelationFields = false,
        withAggregations = false,
        options?: CreateSchemaOptions,
    ): GraphQLInputObjectType {
        const typeName = `${model}${unique ? 'UniqueWhere' : 'Where'}${withAggregations ? 'WithAggregations' : ''}${withoutRelationFields ? 'WithoutRelations' : ''}Input`;
        const uniqueFieldNames = unique
            ? getUniqueFields(this.schema, model)
                .filter(uf => 'def' in uf)
                .map(uf => uf.name)
            : undefined;

        const nextOpts = this.nextOptions(options);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {};

            for (const [field, fieldDef] of this.getModelFields(model)) {
                let fieldType: GraphQLInputType | undefined;

                if (fieldDef.relation) {
                    if (withoutRelationFields || !this.shouldIncludeRelations(options)) continue;
                    // TODO: 补充过滤器
                    fieldType = this.relationFilter(model, field, nextOpts);
                } else {
                    const ignoreSlicing = !!uniqueFieldNames?.includes(field);
                    const enumDef = getEnum(this.schema, fieldDef.type);
                    if (enumDef) {
                        if (Object.keys(enumDef.values).length > 0) {
                            fieldType = this.makeEnumFilterType(model, fieldDef, withAggregations, ignoreSlicing);
                        }
                    } else if (fieldDef.array) {
                        fieldType = this.makeArrayFilterType(model, fieldDef);
                    } else if (this.isTypeDefType(fieldDef.type)) {
                        fieldType = this.makeTypedJsonFilterType(model, fieldDef);
                    } else {
                        fieldType = this.makePrimitiveFilterType(model, fieldDef, withAggregations, ignoreSlicing);
                    }
                }

                if (fieldType) {
                    result[field] = { type: fieldType };
                }
            }

            if (unique) {
                const uniqueFields = getUniqueFields(this.schema, model);
                for (const uniqueField of uniqueFields) {
                    if ('defs' in uniqueField) {
                        const objFields: GraphQLInputFieldConfigMap = {};
                        for (const [key, def] of Object.entries(uniqueField.defs)) {
                            invariant(!def.relation, 'unique field cannot be a relation');
                            let fieldType: GraphQLInputType;
                            const enumDef = getEnum(this.schema, def.type);
                            if (enumDef) {
                                if (Object.keys(enumDef.values).length > 0) {
                                    fieldType = this.makeEnumFilterType(model, def, false, true);
                                } else {
                                    continue;
                                }
                            } else {
                                fieldType = this.makePrimitiveFilterType(model, def, false, true);
                            }
                            objFields[key] = { type: fieldType };
                        }
                        result[uniqueField.name] = this.compoundUniqueInput(model, uniqueField, objFields);
                    }
                }
            }

            // result['$expr'] = { type: GraphQLString };

            const andWhere = this.makeWhereType(model, false, withoutRelationFields, false, options);
            result['AND'] = { type: new GraphQLList(andWhere) };
            result['OR'] = { type: new GraphQLList(andWhere) };
            result['NOT'] = { type: new GraphQLList(andWhere) };

            return result;
        };

        const type = new GraphQLInputObjectType({
            name: typeName,
            fields,
        });

        return type;
    }

    @cache()
    private compoundUniqueInput(model: string, uniqueField: any, objFields: GraphQLInputFieldConfigMap) {
        return { type: new GraphQLInputObjectType({ name: `${model}${uniqueField.name}CompoundUniqueInput`, fields: objFields }) }
    }

    @cache()
    private makeFindType(model: string, operation: CoreCrudOperations, options?: CreateSchemaOptions): any {
        const fields: any = {};
        const unique = operation === 'findUnique';
        const findOne = operation === 'findUnique' || operation === 'findFirst';
        const where = this.makeWhereType(model, unique, false, false, options);
        if (unique) {
            fields['where'] = { type: new GraphQLNonNull(where) };
        } else {
            fields['where'] = { type: where };
        }

        // fields['select'] = { type: this.makeSelectType(model, options) };
        // fields['include'] = { type: this.makeIncludeType(model, options) };
        // fields['omit'] = { type: this.makeOmitType(model) };

        if (!unique) {
            fields['skip'] = { type: GraphQLInt };
            if (findOne) {
                // fields['take'] = { type: GraphQLInt }; // 固定为 1，但输入允许任意值，实际会在解析时处理
            } else {
                fields['take'] = { type: GraphQLInt };
            }
            fields['orderBy'] = { type: new GraphQLList(this.makeOrderByType(model, true, false, options)) };
            fields['cursor'] = { type: this.makeCursorType(model, options) };
            if (!this.providerSupportsDistinct) {
                fields['distinct'] = { type: this.makeDistinctType(model) };
            }
        }

        return fields

        // new GraphQLInputObjectType({
        //     name: `${model}${operation === 'findUnique' ? 'FindUnique' : operation === 'findFirst' ? 'FindFirst' : 'FindMany'}Input`,
        //     // type: this.makeSelectType(model, options),
        //     fields,
        // });
    }

    // @cache()
    // private makeCountAggregateInputType(model: string): GraphQLInputObjectType {
    //     const fields: GraphQLInputFieldConfigMap = {
    //         _all: { type: GraphQLBoolean },
    //     };
    //     for (const [field] of this.getModelFields(model)) {
    //         fields[field] = { type: GraphQLBoolean };
    //     }
    //     return new GraphQLInputObjectType({
    //         name: `${model}CountAggregateInput`,
    //         fields,
    //     });
    // }

    // @cache()
    // private makeSumAvgInputType(model: string): GraphQLInputObjectType {
    //     const fields: GraphQLInputFieldConfigMap = {};
    //     for (const [field, fieldDef] of this.getModelFields(model)) {
    //         if (this.isNumericField(fieldDef)) {
    //             fields[field] = { type: GraphQLBoolean };
    //         }
    //     }
    //     return new GraphQLInputObjectType({
    //         name: `${model}SumAvgInput`,
    //         fields,
    //     });
    // }

    // @cache()
    // private makeMinMaxInputType(model: string): GraphQLInputObjectType {
    //     const fields: GraphQLInputFieldConfigMap = {};
    //     for (const [field, fieldDef] of this.getModelFields(model)) {
    //         if (!fieldDef.relation && !fieldDef.array) {
    //             fields[field] = { type: GraphQLBoolean };
    //         }
    //     }
    //     return new GraphQLInputObjectType({
    //         name: `${model}MinMaxInput`,
    //         fields,
    //     });
    // }

    @cache()
    private makeCreateDataType(
        model: string,
        withoutFields: string[] = [],
        withoutRelationFields = false,
        options?: CreateSchemaOptions,
    ): GraphQLInputObjectType {
        const typeName = `${model}CreateData${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}${withoutRelationFields ? 'WithoutRelations' : ''}Input`;

        const skipRelations = withoutRelationFields || !this.shouldIncludeRelations(options);
        const modelDef = requireModel(this.schema, model);
        const modelFields = this.getModelFields(model);
        const nextOpts = this.nextOptions(options);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {};

            for (const [field, fieldDef] of modelFields) {
                if (withoutFields.includes(field)) continue;
                if (fieldDef.computed || fieldDef.isDiscriminator) continue;

                if (fieldDef.relation) {
                    if (skipRelations) continue;
                    if (!this.isModelAllowed(fieldDef.type)) continue;

                    const excludeFields: string[] = [];
                    const oppositeField = fieldDef.relation.opposite;
                    if (oppositeField) {
                        excludeFields.push(oppositeField);
                        const oppositeFieldDef = requireField(this.schema, fieldDef.type, oppositeField);
                        if (oppositeFieldDef.relation?.fields) {
                            excludeFields.push(...oppositeFieldDef.relation.fields);
                        }
                    }

                    let fieldType = this.makeRelationManipulationType(model, field, excludeFields, 'create', nextOpts);
                    if (fieldDef.optional || fieldDef.array) {
                        // 可选
                    } else {
                        let allFksOptional = false;
                        if (fieldDef.relation.fields) {
                            allFksOptional = fieldDef.relation.fields.every(f => {
                                const fkDef = requireField(this.schema, model, f);
                                return fkDef.optional || fieldHasDefaultValue(fkDef);
                            });
                        }
                        if (allFksOptional) {
                            // 可选
                        } else {
                            fieldType = new GraphQLNonNull(fieldType) as unknown as GraphQLInputObjectType;
                        }
                    }
                    if (fieldDef.optional && !fieldDef.array) {
                        // 允许 null，GraphQL 默认允许 null，无需处理
                    }
                    result[field] = { type: fieldType };
                } else {
                    let fieldType: GraphQLInputType = this.makeScalarType(fieldDef.type, fieldDef.array, fieldDef.optional || !!fieldHasDefaultValue(fieldDef));
                    if (fieldDef.array) {
                        // 数组
                        fieldType = new GraphQLList(fieldType);
                    }
                    if (fieldDef.optional || fieldHasDefaultValue(fieldDef)) {
                        // 可选
                    } else {
                        fieldType = new GraphQLNonNull(fieldType);
                    }
                    // if (fieldDef.optional && fieldDef.type === 'Json') {
                    //     // 允许 DbNull，这里忽略，用标量处理
                    // }
                    result[field] = { type: fieldType };
                }
            }

            return result;
        };

        const type = new GraphQLInputObjectType({
            name: typeName,
            fields,
        });

        return type;
    }

    @cache()
    private makeUpdateDataType(
        model: string,
        withoutFields: string[] = [],
        withoutRelationFields = false,
        options?: CreateSchemaOptions,
    ): GraphQLInputObjectType {
        const typeName = `${model}UpdateData${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}${withoutRelationFields ? 'WithoutRelations' : ''}Input`;

        const skipRelations = withoutRelationFields || !this.shouldIncludeRelations(options);
        const modelDef = requireModel(this.schema, model);
        const modelFields = this.getModelFields(model);
        const nextOpts = this.nextOptions(options);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {};

            for (const [field, fieldDef] of modelFields) {
                if (withoutFields.includes(field)) continue;
                if (fieldDef.computed || fieldDef.isDiscriminator) continue;

                if (fieldDef.relation) {
                    if (skipRelations) continue;
                    if (!this.isModelAllowed(fieldDef.type)) continue;

                    const excludeFields: string[] = [];
                    const oppositeField = fieldDef.relation.opposite;
                    if (oppositeField) {
                        excludeFields.push(oppositeField);
                        const oppositeFieldDef = requireField(this.schema, fieldDef.type, oppositeField);
                        if (oppositeFieldDef.relation?.fields) {
                            excludeFields.push(...oppositeFieldDef.relation.fields);
                        }
                    }
                    let fieldType = this.makeRelationManipulationType(model, field, excludeFields, 'update', nextOpts);
                    result[field] = { type: fieldType };
                } else {
                    let fieldType: GraphQLInputType = this.makeScalarType(fieldDef.type);
                    if (this.isNumericField(fieldDef)) {
                        fieldType = this.incrementalInput(model, field, fieldType as GraphQLInputObjectType);
                    }
                    if (fieldDef.array) {
                        fieldType = this.arrayUpdateInput(model, field, fieldType as GraphQLInputObjectType);
                    }
                    result[field] = { type: fieldType };
                }
            }

            return result;
        };

        const type = new GraphQLInputObjectType({
            name: typeName,
            fields,
        });

        return type;
    }

    @cache()
    private incrementalInput(model: string, field: string, fieldType: GraphQLInputObjectType) {
        const incrementalTypeName = `${model}${field}${fieldType.name}IncrementalInput`;
        return new GraphQLInputObjectType({
            name: incrementalTypeName,
            fields: {
                set: { type: fieldType },
                increment: { type: GraphQLFloat },
                decrement: { type: GraphQLFloat },
                multiply: { type: GraphQLFloat },
                divide: { type: GraphQLFloat },
            },
        });
    }

    @cache()
    private arrayUpdateInput(model: string, field: string, fieldType: GraphQLInputObjectType) {
        const arrayTypeName = `${model}${field}${fieldType.name}ArrayUpdateInput`;
        const arrayType = new GraphQLList(fieldType);
        return new GraphQLInputObjectType({
            name: arrayTypeName,
            fields: {
                set: { type: arrayType },
                push: { type: new GraphQLList(fieldType) },
            },
        })
    }

    @cache()
    private makeRelationManipulationType(
        model: string,
        field: string,
        withoutFields: string[],
        mode: 'create' | 'update',
        options?: CreateSchemaOptions,
    ): GraphQLInputObjectType {
        const fieldDef = requireField(this.schema, model, field);
        const fieldType = fieldDef.type;
        const array = !!fieldDef.array;
        const canCreateModel = this.canCreateModel(fieldType);

        const fields = () => {
            const result: GraphQLInputFieldConfigMap = {
                connect: { type: this.makeConnectDataType(fieldType, array, options) },
            };

            if (canCreateModel) {
                result['create'] = { type: this.makeCreateDataType(fieldDef.type, withoutFields, false, options) };
                const connectOrCreateType = this.makeConnectOrCreateDataType(fieldType, withoutFields, options);
                result['connectOrCreate'] = { type: array ? new GraphQLList(connectOrCreateType) : connectOrCreateType };
            }

            if (array && canCreateModel) {
                result['createMany'] = { type: this.makeCreateManyPayloadType(fieldType, withoutFields, options) };
            }

            if (mode === 'update') {
                if (fieldDef.optional || fieldDef.array) {
                    result['disconnect'] = { type: this.makeDisconnectDataType(fieldType, array, options) };
                    result['delete'] = { type: this.makeDeleteRelationDataType(fieldType, array, true, options) };
                }
                result['update'] = array
                    ? { type: new GraphQLList(this.makeUpdateRelationItemType(fieldType, withoutFields, options)) }
                    : { type: this.makeUpdateRelationItemType(fieldType, withoutFields, options) };
                if (canCreateModel) {
                    result['upsert'] = array
                        ? { type: new GraphQLList(this.makeUpsertRelationItemType(fieldType, withoutFields, options)) }
                        : { type: this.makeUpsertRelationItemType(fieldType, withoutFields, options) };
                }
                if (array) {
                    result['set'] = { type: this.makeSetDataType(fieldType, true, options) };
                    result['updateMany'] = { type: new GraphQLList(this.makeUpdateManyRelationItemType(fieldType, withoutFields, options)) };
                    result['deleteMany'] = { type: this.makeDeleteRelationDataType(fieldType, true, false, options) };
                }
            }

            return result;
        };

        return new GraphQLInputObjectType({
            name: `${model}${field}Relation${mode === 'create' ? 'Create' : 'Update'}Input`,
            fields,
        });
    }

    private canCreateModel(model: string) {
        const modelDef = requireModel(this.schema, model);
        if (modelDef.isDelegate) return false;
        const hasRequiredUnsupportedFields = Object.values(modelDef.fields).some(
            (fieldDef: any) => fieldDef.type === 'Unsupported' && !fieldDef.optional && !fieldHasDefaultValue(fieldDef),
        );
        if (hasRequiredUnsupportedFields) return false;
        return true;
    }

    @cache()
    private makeConnectOrCreateDataType(model: string, withoutFields: string[], options?: CreateSchemaOptions): GraphQLInputType {
        const type = new GraphQLInputObjectType({
            name: `${model}ConnectOrCreate${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}Input`,
            fields: {
                where: { type: this.makeWhereType(model, true, false, false, options) },
                create: { type: this.makeCreateDataType(model, withoutFields, false, options) },
            },
        });
        return type;
    }

    @cache()
    private makeCreateManyPayloadType(model: string, withoutFields: string[], options?: CreateSchemaOptions): GraphQLInputObjectType {
        const dataType = this.makeCreateDataType(model, withoutFields, true, options);
        const type = new GraphQLInputObjectType({
            name: `${model}CreateManyPayload${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}Input`,
            fields: {
                data: { type: dataType },
                skipDuplicates: { type: GraphQLBoolean },
            },
        });
        return type;
    }

    @cache()
    private makeUpdateRelationItemType(model: string, withoutFields: string[], options?: CreateSchemaOptions): GraphQLInputObjectType {
        const type = new GraphQLInputObjectType({
            name: `${model}UpdateRelationItem${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}Input`,
            fields: {
                where: { type: this.makeWhereType(model, false, false, false, options) },
                data: { type: this.makeUpdateDataType(model, withoutFields, false, options) },
            },
        });
        return type;
    }

    @cache()
    private makeUpsertRelationItemType(model: string, withoutFields: string[], options?: CreateSchemaOptions): GraphQLInputObjectType {
        const type = new GraphQLInputObjectType({
            name: `${model}UpsertRelationItem${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}Input`,
            fields: {
                where: { type: this.makeWhereType(model, true, false, false, options) },
                create: { type: this.makeCreateDataType(model, withoutFields, false, options) },
                update: { type: this.makeUpdateDataType(model, withoutFields, false, options) },
            },
        });
        return type;
    }

    @cache()
    private makeUpdateManyRelationItemType(model: string, withoutFields: string[], options?: CreateSchemaOptions): GraphQLInputObjectType {
        const typeName = `${model}UpdateManyRelationItem${withoutFields.length > 0 ? `WithoutFields${withoutFields.join('And')}` : ''}Input`;
        const type = new GraphQLInputObjectType({
            name: typeName,
            fields: {
                where: { type: this.makeWhereType(model, false, true, false, options) },
                data: { type: this.makeUpdateDataType(model, withoutFields, false, options) },
            },
        });
        return type;
    }

    private makeSetDataType(model: string, canBeArray: boolean, options?: CreateSchemaOptions): GraphQLInputType {
        const where = this.makeWhereType(model, true, false, false, options);
        return canBeArray ? new GraphQLList(where) : where;
    }

    private makeConnectDataType(model: string, canBeArray: boolean, options?: CreateSchemaOptions): GraphQLInputType {
        const where = this.makeWhereType(model, true, false, false, options);
        return canBeArray ? new GraphQLList(where) : where;
    }

    private makeDisconnectDataType(model: string, canBeArray: boolean, options?: CreateSchemaOptions): GraphQLInputType {
        if (canBeArray) {
            return new GraphQLList(this.makeWhereType(model, true, false, false, options));
        } else {
            return this.makeWhereType(model, false, false, false, options);
        }
    }

    private makeDeleteRelationDataType(model: string, toManyRelation: boolean, uniqueFilter: boolean, options?: CreateSchemaOptions): GraphQLInputType {
        const where = this.makeWhereType(model, uniqueFilter, false, false, options);
        if (toManyRelation) return new GraphQLList(where);
        else return where;
    }

    // 参数

    makeExistsType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        return {
            where: { type: this.makeWhereType(model, false, false, false, options) },
        };
    }

    makeFindUniqueType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        return this.makeFindType(model, 'findUnique', options);
    }

    makeFindFirstType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        return this.makeFindType(model, 'findFirst', options);
    }

    makeFindManyType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        return this.makeFindType(model, 'findMany', options);
    }

    @cache()
    makeCountType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: this.makeWhereType(model, false, false, false, options) },
            skip: { type: GraphQLInt },
            take: { type: GraphQLInt },
            orderBy: { type: new GraphQLList(this.makeOrderByType(model, true, false, options)) },
            // select: { type: this.makeCountAggregateInputType(model) },
        };
        return fields
    }

    @cache()
    makeAggregateType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: this.makeWhereType(model, false, false, false, options) },
            skip: { type: GraphQLInt },
            take: { type: GraphQLInt },
            orderBy: { type: new GraphQLList(this.makeOrderByType(model, true, false, options)) },
            // _count: { type: this.makeCountAggregateInputType(model) },
            // _avg: { type: this.makeSumAvgInputType(model) },
            // _sum: { type: this.makeSumAvgInputType(model) },
            // _min: { type: this.makeMinMaxInputType(model) },
            // _max: { type: this.makeMinMaxInputType(model) },
        };
        return fields
    }

    @cache()
    makeGroupByType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const nonRelationFields = this.getModelFields(model)
            .filter(([, def]) => !def.relation)
            .map(([name]) => name);
        const byEnum = new GraphQLEnumType({
            name: `${model}GroupByField`,
            values: Object.fromEntries(nonRelationFields.map(f => [f, { value: f }])),
        });
        const fields = {
            where: { type: this.makeWhereType(model, false, false, false, options) },
            orderBy: { type: new GraphQLList(this.makeOrderByType(model, false, true, options)) },
            by: { type: new GraphQLList(byEnum) },
            having: { type: this.makeWhereType(model, false, true, true, options) },
            skip: { type: GraphQLInt },
            take: { type: GraphQLInt },
            // _count: { type: this.makeCountAggregateInputType(model) },
            // _avg: { type: this.makeSumAvgInputType(model) },
            // _sum: { type: this.makeSumAvgInputType(model) },
            // _min: { type: this.makeMinMaxInputType(model) },
            // _max: { type: this.makeMinMaxInputType(model) },
        };
        return fields;
    }

    @cache()
    makeCreateType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const dataType = this.makeCreateDataType(model, [], false, options);
        const fields = {
            data: { type: dataType },
            // select: { type: this.makeSelectType(model, options) },
            // include: { type: this.makeIncludeType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeCreateManyType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const payload = this.makeCreateManyPayloadType(model, [], options);
        const fields = {
            data: { type: payload.getFields()['data'].type },
            skipDuplicates: { type: GraphQLBoolean },
        };
        return fields;
    }

    @cache()
    makeCreateManyAndReturnType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const base = this.makeCreateManyPayloadType(model, [], options);
        const fields = {
            ...base.getFields(),
            // select: { type: this.makeSelectType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeUpdateType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: new GraphQLNonNull(this.makeWhereType(model, true, false, false, options)) },
            data: { type: new GraphQLNonNull(this.makeUpdateDataType(model, [], false, options)) },
            // select: { type: this.makeSelectType(model, options) },
            // include: { type: this.makeIncludeType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeUpdateManyType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: this.makeWhereType(model, false, false, false, options) },
            data: { type: this.makeUpdateDataType(model, [], true, options) },
            limit: { type: GraphQLInt },
        };
        return fields;
    }

    @cache()
    makeUpdateManyAndReturnType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const base = this.makeUpdateManyType(model, options);
        const fields = {
            ...base,
            // select: { type: this.makeSelectType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeUpsertType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: new GraphQLNonNull(this.makeWhereType(model, true, false, false, options)) },
            create: { type: new GraphQLNonNull(this.makeCreateDataType(model, [], false, options)) },
            update: { type: new GraphQLNonNull(this.makeUpdateDataType(model, [], false, options)) },
            // select: { type: this.makeSelectType(model, options) },
            // include: { type: this.makeIncludeType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeDeleteType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: new GraphQLNonNull(this.makeWhereType(model, true, false, false, options)) },
            // select: { type: this.makeSelectType(model, options) },
            // include: { type: this.makeIncludeType(model, options) },
            // omit: { type: this.makeOmitType(model) },
        };
        return fields;
    }

    @cache()
    makeDeleteManyType(
        model: string,
        options: CreateSchemaOptions | undefined = undefined,
    ) {
        const fields = {
            where: { type: this.makeWhereType(model, false, false, false, options) },
            limit: { type: GraphQLInt },
        };
        return fields;
    }

    // 输出

    @cache()
    makeSelectOutput(model: string, options: CreateSchemaOptions | undefined = undefined): GraphQLObjectType {
        return new GraphQLObjectType({
            name: `${model}Output`,
            fields: () => {
                const fields: any = {};
                for (const [field, fieldDef] of this.getModelFields(model)) {
                    if (fieldDef.relation) {
                        if (!this.shouldIncludeRelations(options)) continue;
                        if (this.isModelAllowed(fieldDef.type)) {
                            fields[field] = this.makeRelationSelectIncludeOutput(model, field, options);
                        }
                    } else {
                        fields[field] = { type: this.makeScalarType(fieldDef.type) };
                    }
                }
                if (this.shouldIncludeRelations(options)) {
                    const countSchema = this.makeCountSelectionOutput(model, options);
                    if (countSchema) fields['_count'] = { type: countSchema };
                }
                this.addExtResultFields(model, fields);
                return fields;
            },
        });
    }

    @cache()
    private makeRelationSelectIncludeOutput(model: string, field: string, options?: CreateSchemaOptions): any {
        const fieldDef = requireField(this.schema, model, field);
        const nextOpts = this.nextOptions(options);

        const result: any = {};
        // if (fieldDef.array || fieldDef.optional) {
        //     result['where'] = { type: this.makeWhereType(fieldDef.type, false, false, false, nextOpts) };
        // }
        // result['select'] = { type: this.makeSelectType(fieldDef.type, nextOpts) };
        // result['include'] = { type: this.makeIncludeType(fieldDef.type, nextOpts) };
        // result['omit'] = { type: this.makeOmitType(fieldDef.type) };
        if (fieldDef.array) {
            result['where'] = { type: this.makeWhereType(fieldDef.type, false, false, false, nextOpts) };
            result['orderBy'] = { type: new GraphQLList(this.makeOrderByType(fieldDef.type, true, false, nextOpts)) };
            result['skip'] = { type: GraphQLInt };
            result['take'] = { type: GraphQLInt };
            result['cursor'] = { type: this.makeCursorType(fieldDef.type, nextOpts) };
            if (!this.providerSupportsDistinct) {
                result['distinct'] = { type: this.makeDistinctType(fieldDef.type) };
            }
        }

        return {
            type: fieldDef.array ? new GraphQLList(this.makeSelectOutput(fieldDef.type, nextOpts)) : this.makeSelectOutput(fieldDef.type, nextOpts),
            args: result,
        };
    }

    @cache()
    private makeCountSelectionOutput(model: string, options?: CreateSchemaOptions): GraphQLObjectType | null {
        const modelDef = requireModel(this.schema, model);
        const toManyRelations = Object.values(modelDef.fields).filter((def: any) => def.relation && def.array);
        if (toManyRelations.length === 0) return null;
        const nextOpts = this.nextOptions(options);
        const selectFields: any = {};
        for (const fieldDef of toManyRelations) {
            const where = this.makeWhereType(fieldDef.type, false, false, false, nextOpts);
            selectFields[fieldDef.name] = {
                type: GraphQLInt,
                args: { where: { type: where } },
            };
        }
        return new GraphQLObjectType({
            name: `${model}CountOutput`,
            fields: selectFields,
        });
    }

    @cache()
    makeCountAggregateOutput(model: string): GraphQLObjectType {
        const fields: any = {
            _all: { type: GraphQLInt },
        };
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (!fieldDef.relation && !fieldDef.array) {
                fields[field] = { type: GraphQLInt };
            }
        }
        return new GraphQLObjectType({
            name: `${model}CountAggregateOutput`,
            fields,
        });
    }

    @cache()
    makeSumAvgOutput(model: string): GraphQLObjectType {
        const fields: any = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (this.isNumericField(fieldDef)) {
                fields[field] = { type: GraphQLFloat };
            }
        }
        return new GraphQLObjectType({
            name: `${model}SumAvgOutput`,
            fields,
        });
    }

    @cache()
    makeMinMaxOutput(model: string): GraphQLObjectType {
        const fields: any = {};
        for (const [field, fieldDef] of this.getModelFields(model)) {
            if (!fieldDef.relation && !fieldDef.array) {
                fields[field] = { type: this.makeScalarType(fieldDef.type) };
            }
        }
        return new GraphQLObjectType({
            name: `${model}MinMaxOutput`,
            fields,
        });
    }

    @cache()
    makeAggregateOutput(model: string): GraphQLObjectType {
        const fields: any = {
            _count: { type: this.makeCountAggregateOutput(model) },
            _avg: { type: this.makeSumAvgOutput(model) },
            _sum: { type: this.makeSumAvgOutput(model) },
            _min: { type: this.makeMinMaxOutput(model) },
            _max: { type: this.makeMinMaxOutput(model) },
        };
        return new GraphQLObjectType({
            name: `${model}AggregateOutput`,
            fields,
        });
    }

    @cache()
    makeGroupByOutput(model: string): GraphQLObjectType {
        const baseFields = this.getModelFields(model)
            .filter(([field, fieldDef]) => !fieldDef.relation && !fieldDef.array)
            .map(([field, fieldDef]) => [
                field,
                { type: this.makeScalarType(fieldDef.type, false, fieldDef.optional) }
            ]);
        // console.log(Object.fromEntries(baseFields));
        const fields: any = {
            ...Object.fromEntries(baseFields),
            _count: { type: this.makeCountAggregateOutput(model) },
            _avg: { type: this.makeSumAvgOutput(model) },
            _sum: { type: this.makeSumAvgOutput(model) },
            _min: { type: this.makeMinMaxOutput(model) },
            _max: { type: this.makeMinMaxOutput(model) },
        };
        return new GraphQLObjectType({
            name: `${model}GroupByOutput`,
            fields,
        });
    }

    @cache()
    makeAffectedRowsOutput(): GraphQLObjectType {
        return new GraphQLObjectType({
            name: 'affectedRowsOutput',
            fields: { count: { type: new GraphQLNonNull(GraphQLInt) } },
        });
    }

    readonly operationMaps = {
        findUnique: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeFindUniqueType(model),
        }),
        findFirst: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeFindFirstType(model),
        }),
        findMany: (model) => ({
            type: new GraphQLList(this.makeSelectOutput(model)),
            args: this.makeFindManyType(model),
        }),
        count: (model) => ({
            type: this.makeCountAggregateOutput(model),
            args: this.makeCountType(model),
        }),
        aggregate: (model) => ({
            type: this.makeAggregateOutput(model),
            args: this.makeAggregateType(model),
        }),
        groupBy: (model) => ({
            type: new GraphQLList(this.makeGroupByOutput(model)),
            args: this.makeGroupByType(model),
        }),
        exists: (model) => ({
            type: GraphQLBoolean,
            args: this.makeExistsType(model),
        }),
        create: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeCreateType(model),
        }),
        createMany: (model) => ({
            type: new GraphQLList(this.makeAffectedRowsOutput()),
            args: this.makeCreateManyType(model),
        }),
        createManyAndReturn: (model) => ({
            type: new GraphQLList(this.makeSelectOutput(model)),
            args: this.makeCreateManyAndReturnType(model),
        }),
        update: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeUpdateType(model),
        }),
        updateMany: (model) => ({
            type: this.makeAffectedRowsOutput(),
            args: this.makeUpdateManyType(model),
        }),
        updateManyAndReturn: (model) => ({
            type: new GraphQLList(this.makeSelectOutput(model)),
            args: this.makeUpdateManyAndReturnType(model),
        }),
        upsert: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeUpsertType(model),
        }),
        delete: (model) => ({
            type: this.makeSelectOutput(model),
            args: this.makeDeleteType(model),
        }),
        deleteMany: (model) => ({
            type: this.makeAffectedRowsOutput(),
            args: this.makeDeleteManyType(model),
        }),
    }

    formatFieldName(model: string, operation: string) {
        const lower = model[0].toLowerCase() + model.slice(1);
        return `${lower}_${operation}`
    }

    @cache()
    makeQueryType(): GraphQLObjectType {
        const queryFields: any = {};
        const modelNames = this.getEffectiveModel();
        for (const model of modelNames) {
            const operations = this.getEffectiveOperations(model).filter((op) => AllReadOperations.includes(op as typeof AllReadOperations[number]));
            for (const operation of operations) {
                queryFields[this.formatFieldName(model, operation)] = this.operationMaps[operation](model);
            }
        }
        return new GraphQLObjectType({ name: 'Query', fields: queryFields });
    }

    @cache()
    makeMutationType(): GraphQLObjectType {
        const mutationFields: any = {};
        const modelNames = this.getEffectiveModel();
        for (const model of modelNames) {
            const operations = this.getEffectiveOperations(model).filter((op) => AllWriteOperations.includes(op as typeof AllWriteOperations[number]));
            for (const operation of operations) {
                mutationFields[this.formatFieldName(model, operation)] = this.operationMaps[operation](model);
            }
        }
        return new GraphQLObjectType({ name: 'Mutation', fields: mutationFields });
    }

}