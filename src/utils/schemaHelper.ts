import { GraphQLList, GraphQLNonNull, GraphQLString, GraphQLType, GraphQLScalarType } from 'graphql';
import { TypeCache } from '../types/TypeCache';

export interface FieldDef {
    type: string;
    array?: boolean;
    optional?: boolean;
    relation?: boolean;
    unique?: boolean;
    foreignKeyFor?: string;
    default?: { name: string };
}

export interface ModelDef {
    fields: Record<string, FieldDef>;
    idFields: string[];
    uniqueConstraints?: Record<string, { fields: string[] }>;
}

export interface ZenSchema {
    models: Record<string, ModelDef>;
    enums?: Record<string, any>;
}

export class ModelHelper {
    private zenSchema: ZenSchema;

    constructor(zenSchema: ZenSchema) {
        this.zenSchema = zenSchema;
    }

    getModelDef(model: string): ModelDef {
        const def = this.zenSchema.models[model];
        if (!def) throw new Error(`Model "${model}" not found`);
        if (!def.fields || typeof def.fields !== 'object') {
            throw new Error(`Model "${model}" has no valid fields`);
        }
        return def;
    }

    isScalar(field: FieldDef): boolean {
        return !field.relation && !field.foreignKeyFor;
    }

    isRelation(field: FieldDef): boolean {
        return !!field.relation;
    }

    getTargetModel(field: FieldDef): string {
        return field.type;
    }

    isAutoIncrement(field: FieldDef): boolean {
        return field.default?.name === 'autoincrement';
    }
}

export class TypeResolver {
    private typeCache: TypeCache;
    private scalarRegistry: Record<string, GraphQLScalarType>;

    constructor(typeCache: TypeCache, scalarRegistry: Record<string, GraphQLScalarType>) {
        this.typeCache = typeCache;
        this.scalarRegistry = scalarRegistry;
    }

    fieldToGraphQLType(field: FieldDef, optional: Boolean = false): GraphQLType {
        let base: GraphQLType;
        if (this.typeCache.has(field.type)) {
            base = this.typeCache.get(field.type)!;
        } else if (this.scalarRegistry[field.type]) {
            base = this.scalarRegistry[field.type];
        } else {
            base = GraphQLString; // fallback
        }

        let type = base;
        if (!optional && !field.optional) {
            type = new GraphQLNonNull(base);
        }
        if (field.array) {
            type = new GraphQLList(type);
        }
        return type;
    }
}
