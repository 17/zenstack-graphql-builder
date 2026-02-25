import {
    GraphQLInputObjectType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLBoolean,
    GraphQLInt,
} from 'graphql';
import { TypeCache } from './TypeCache';
import { FilterBuilder } from './FilterBuilder';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { SortOrderEnum, NullsOrderEnum } from './enums';

export class InputTypeBuilder {
    private typeCache: TypeCache;
    private filterBuilder: FilterBuilder;
    private modelHelper: ModelHelper;
    private typeResolver: TypeResolver;

    constructor(
        typeCache: TypeCache,
        filterBuilder: FilterBuilder,
        modelHelper: ModelHelper,
        typeResolver: TypeResolver
    ) {
        this.typeCache = typeCache;
        this.filterBuilder = filterBuilder;
        this.modelHelper = modelHelper;
        this.typeResolver = typeResolver;
    }

    getWhereInput(model: string): GraphQLInputObjectType {
        const name = `${model}WhereInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        let whereInput: GraphQLInputObjectType;
        whereInput = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields: any = {
                    AND: { type: new GraphQLList(whereInput) },
                    OR: { type: new GraphQLList(whereInput) },
                    NOT: { type: new GraphQLList(whereInput) },
                };

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isScalar(field)) {
                        const filter = this.filterBuilder.getFilter(field.type);
                        if (filter) fields[fieldName] = { type: filter };
                    }
                }

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isRelation(field)) {
                        const target = this.modelHelper.getTargetModel(field);
                        const targetWhere = this.getWhereInput(target);
                        const filterName = `${model}${fieldName}RelationFilter`;
                        let filter = this.typeCache.get<GraphQLInputObjectType>(filterName);
                        if (!filter) {
                            filter = new GraphQLInputObjectType({
                                name: filterName,
                                fields: field.array
                                    ? {
                                        every: { type: targetWhere },
                                        some: { type: targetWhere },
                                        none: { type: targetWhere },
                                    }
                                    : {
                                        is: { type: targetWhere },
                                        isNot: { type: targetWhere },
                                    },
                            });
                            this.typeCache.set(filterName, filter);
                        }
                        fields[fieldName] = { type: filter };
                    }
                }
                return fields;
            },
        });

        this.typeCache.set(name, whereInput);
        return whereInput;
    }

    getWhereUniqueInput(model: string): GraphQLInputObjectType {
        const name = `${model}WhereUniqueInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = {};

        // ID fields
        for (const idField of modelDef.idFields || []) {
            const field = modelDef.fields[idField];
            if (field) {
                fields[idField] = { type: this.typeResolver.fieldToGraphQLType(field) as any };
            }
        }

        // Single field unique constraints
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if ((field as any).unique) {
                fields[fieldName] = { type: this.typeResolver.fieldToGraphQLType(field) as any };
            }
        }

        // Multi-field unique constraints
        if (modelDef.uniqueConstraints) {
            for (const [constraintName, constraint] of Object.entries(modelDef.uniqueConstraints)) {
                const constraintFields = (constraint as any).fields;
                if (constraintFields.length === 1) {
                    const fieldName = constraintFields[0];
                    const field = modelDef.fields[fieldName];
                    if (field) {
                        fields[fieldName] = { type: this.typeResolver.fieldToGraphQLType(field) as any };
                    }
                } else {
                    // Complex unique constraint
                    const complexUniqueName = `${model}${constraintName}CompoundUniqueInput`;
                    let complexType = this.typeCache.get<GraphQLInputObjectType>(complexUniqueName);
                    if (!complexType) {
                        const complexFields: any = {};
                        for (const fieldName of constraintFields) {
                            const field = modelDef.fields[fieldName];
                            if (field) {
                                complexFields[fieldName] = {
                                    type: new GraphQLNonNull(this.typeResolver.fieldToGraphQLType(field) as any),
                                };
                            }
                        }
                        complexType = new GraphQLInputObjectType({
                            name: complexUniqueName,
                            fields: complexFields,
                        });
                        this.typeCache.set(complexUniqueName, complexType);
                    }
                    fields[constraintName] = { type: complexType };
                }
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeCache.set(name, input);
        return input;
    }

    getOrderByInput(model: string): GraphQLInputObjectType {
        const name = `${model}OrderByInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const orderBy = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields: any = {};

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isScalar(field)) {
                        if (field.optional) {
                            const optName = `${model}${fieldName}OrderByInput`;
                            let optType = this.typeCache.get<GraphQLInputObjectType>(optName);
                            if (!optType) {
                                optType = new GraphQLInputObjectType({
                                    name: optName,
                                    fields: {
                                        sort: { type: new GraphQLNonNull(SortOrderEnum) },
                                        nulls: { type: NullsOrderEnum },
                                    },
                                });
                                this.typeCache.set(optName, optType);
                            }
                            fields[fieldName] = { type: optType };
                        } else {
                            fields[fieldName] = { type: SortOrderEnum };
                        }
                    }
                }

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isRelation(field)) {
                        const target = this.modelHelper.getTargetModel(field);
                        if (field.array) {
                            const aggName = `${model}${fieldName}OrderByRelationAggregateInput`;
                            let aggType = this.typeCache.get<GraphQLInputObjectType>(aggName);
                            if (!aggType) {
                                aggType = new GraphQLInputObjectType({
                                    name: aggName,
                                    fields: { _count: { type: SortOrderEnum } },
                                });
                                this.typeCache.set(aggName, aggType);
                            }
                            fields[fieldName] = { type: aggType };
                        } else {
                            fields[fieldName] = { type: this.getOrderByInput(target) };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeCache.set(name, orderBy);
        return orderBy;
    }

    getCreateInput(model: string): GraphQLInputObjectType {
        const name = `${model}CreateInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const create = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields: any = {};

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isScalar(field) && !this.modelHelper.isAutoIncrement(field)) {
                        fields[fieldName] = { type: this.typeResolver.fieldToGraphQLType(field) as any };
                    }
                }

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isRelation(field)) {
                        const target = this.modelHelper.getTargetModel(field);
                        const targetCreate = this.getCreateInput(target);
                        const targetWhereUnique = this.getWhereUniqueInput(target);
                        const targetCreateMany = this.getCreateManyInput(target);
                        const targetConnectOrCreate = this.getConnectOrCreateInput(target);

                        if (field.array) {
                            const nestedName = `${model}${fieldName}CreateNestedManyInput`;
                            let nestedType = this.typeCache.get<GraphQLInputObjectType>(nestedName);
                            if (!nestedType) {
                                nestedType = new GraphQLInputObjectType({
                                    name: nestedName,
                                    fields: {
                                        create: { type: new GraphQLList(new GraphQLNonNull(targetCreate)) },
                                        connect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        connectOrCreate: { type: new GraphQLList(new GraphQLNonNull(targetConnectOrCreate)) },
                                        createMany: { type: targetCreateMany },
                                    },
                                });
                                this.typeCache.set(nestedName, nestedType);
                            }
                            fields[fieldName] = { type: nestedType };
                        } else {
                            const nestedName = `${model}${fieldName}CreateNestedOneInput`;
                            let nestedType = this.typeCache.get<GraphQLInputObjectType>(nestedName);
                            if (!nestedType) {
                                nestedType = new GraphQLInputObjectType({
                                    name: nestedName,
                                    fields: {
                                        create: { type: targetCreate },
                                        connect: { type: targetWhereUnique },
                                        connectOrCreate: { type: targetConnectOrCreate },
                                    },
                                });
                                this.typeCache.set(nestedName, nestedType);
                            }
                            fields[fieldName] = { type: nestedType };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeCache.set(name, create);
        return create;
    }

    getUpdateInput(model: string): GraphQLInputObjectType {
        const name = `${model}UpdateInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const update = new GraphQLInputObjectType({
            name,
            fields: () => {
                const fields: any = {};

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isScalar(field)) {
                        const baseType = this.typeResolver.fieldToGraphQLType(field, true) as any;
                        const numeric = ['Int', 'Float', 'BigInt', 'Decimal'].includes(field.type);
                        if (numeric && !field.array) {
                            const opName = `${model}${fieldName}UpdateNumberInput`;
                            let opType = this.typeCache.get<GraphQLInputObjectType>(opName);
                            if (!opType) {
                                opType = new GraphQLInputObjectType({
                                    name: opName,
                                    fields: {
                                        set: { type: baseType },
                                        increment: { type: baseType },
                                        decrement: { type: baseType },
                                        multiply: { type: baseType },
                                        divide: { type: baseType },
                                    },
                                });
                                this.typeCache.set(opName, opType);
                            }
                            fields[fieldName] = { type: opType };
                        } else if (field.array) {
                            const arrName = `${model}${fieldName}UpdateArrayInput`;
                            let arrType = this.typeCache.get<GraphQLInputObjectType>(arrName);
                            if (!arrType) {
                                arrType = new GraphQLInputObjectType({
                                    name: arrName,
                                    fields: {
                                        set: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                                        push: { type: new GraphQLList(new GraphQLNonNull(baseType)) },
                                    },
                                });
                                this.typeCache.set(arrName, arrType);
                            }
                            fields[fieldName] = { type: arrType };
                        } else {
                            const scalarName = `${model}${fieldName}UpdateScalarInput`;
                            let scalarType = this.typeCache.get<GraphQLInputObjectType>(scalarName);
                            if (!scalarType) {
                                scalarType = new GraphQLInputObjectType({
                                    name: scalarName,
                                    fields: { set: { type: baseType } },
                                });
                                this.typeCache.set(scalarName, scalarType);
                            }
                            fields[fieldName] = { type: scalarType };
                        }
                    }
                }

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isRelation(field)) {
                        const target = this.modelHelper.getTargetModel(field);
                        const targetCreate = this.getCreateInput(target);
                        const targetWhereUnique = this.getWhereUniqueInput(target);
                        const targetConnectOrCreate = this.getConnectOrCreateInput(target);
                        const targetUpdate = this.getUpdateInput(target);
                        const targetWhere = this.getWhereInput(target);
                        const targetUpdateNested = this.getUpdateNestedInput(target);
                        const targetUpdateManyNested = this.getUpdateManyNestedInput(target);
                        const targetUpsertNested = this.getUpsertNestedInput(target);

                        if (field.array) {
                            const relName = `${model}${fieldName}UpdateManyRelationInput`;
                            let relType = this.typeCache.get<GraphQLInputObjectType>(relName);
                            if (!relType) {
                                relType = new GraphQLInputObjectType({
                                    name: relName,
                                    fields: {
                                        create: { type: new GraphQLList(new GraphQLNonNull(targetCreate)) },
                                        connect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        connectOrCreate: { type: new GraphQLList(new GraphQLNonNull(targetConnectOrCreate)) },
                                        disconnect: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        delete: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                        update: { type: new GraphQLList(new GraphQLNonNull(targetUpdateNested)) },
                                        updateMany: { type: new GraphQLList(new GraphQLNonNull(targetUpdateManyNested)) },
                                        deleteMany: { type: new GraphQLList(new GraphQLNonNull(targetWhere)) },
                                        set: { type: new GraphQLList(new GraphQLNonNull(targetWhereUnique)) },
                                    },
                                });
                                this.typeCache.set(relName, relType);
                            }
                            fields[fieldName] = { type: relType };
                        } else {
                            const relName = `${model}${fieldName}UpdateOneRelationInput`;
                            let relType = this.typeCache.get<GraphQLInputObjectType>(relName);
                            if (!relType) {
                                relType = new GraphQLInputObjectType({
                                    name: relName,
                                    fields: {
                                        create: { type: targetCreate },
                                        connect: { type: targetWhereUnique },
                                        connectOrCreate: { type: targetConnectOrCreate },
                                        disconnect: { type: GraphQLBoolean },
                                        delete: { type: GraphQLBoolean },
                                        update: { type: targetUpdate },
                                        upsert: { type: targetUpsertNested },
                                    },
                                });
                                this.typeCache.set(relName, relType);
                            }
                            fields[fieldName] = { type: relType };
                        }
                    }
                }
                return fields;
            },
        });

        this.typeCache.set(name, update);
        return update;
    }

    getCreateManyInput(model: string): GraphQLInputObjectType {
        const name = `${model}CreateManyInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field) && !this.modelHelper.isAutoIncrement(field)) {
                fields[fieldName] = { type: this.typeResolver.fieldToGraphQLType(field) as any };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeCache.set(name, input);
        return input;
    }

    getOmitInput(model: string): GraphQLInputObjectType {
        const name = `${model}OmitInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeCache.set(name, input);
        return input;
    }

    getCountAggInput(model: string): GraphQLInputObjectType {
        const name = `${model}CountAggregateInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = { _all: { type: GraphQLBoolean } };
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeCache.set(name, input);
        return input;
    }

    getAggInput(model: string): GraphQLInputObjectType {
        const name = `${model}AggregateInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field)) {
                fields[fieldName] = { type: GraphQLBoolean };
            }
        }

        const input = new GraphQLInputObjectType({ name, fields });
        this.typeCache.set(name, input);
        return input;
    }

    getConnectOrCreateInput(model: string): GraphQLInputObjectType {
        const name = `${model}ConnectOrCreateInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: () => ({
                where: { type: new GraphQLNonNull(this.getWhereUniqueInput(model)) },
                create: { type: new GraphQLNonNull(this.getCreateInput(model)) },
            }),
        });
        this.typeCache.set(name, input);
        return input;
    }

    getUpdateNestedInput(model: string): GraphQLInputObjectType {
        const name = `${model}UpdateNestedInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: () => ({
                where: { type: new GraphQLNonNull(this.getWhereUniqueInput(model)) },
                data: { type: new GraphQLNonNull(this.getUpdateInput(model)) },
            }),
        });
        this.typeCache.set(name, input);
        return input;
    }

    getUpdateManyNestedInput(model: string): GraphQLInputObjectType {
        const name = `${model}UpdateManyNestedInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: () => ({
                where: { type: this.getWhereInput(model) },
                data: { type: new GraphQLNonNull(this.getUpdateInput(model)) },
                limit: { type: GraphQLInt },
            }),
        });
        this.typeCache.set(name, input);
        return input;
    }

    getUpsertNestedInput(model: string): GraphQLInputObjectType {
        const name = `${model}UpsertNestedInput`;
        const existing = this.typeCache.get<GraphQLInputObjectType>(name);
        if (existing) return existing;

        const input = new GraphQLInputObjectType({
            name,
            fields: () => ({
                where: { type: new GraphQLNonNull(this.getWhereUniqueInput(model)) },
                create: { type: new GraphQLNonNull(this.getCreateInput(model)) },
                update: { type: new GraphQLNonNull(this.getUpdateInput(model)) },
            }),
        });
        this.typeCache.set(name, input);
        return input;
    }
}
