import {
    GraphQLObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLEnumType,
} from 'graphql';
import { TypeCache } from './TypeCache';
import { ModelHelper, TypeResolver } from '../utils/schemaHelper';
import { InputTypeBuilder } from './InputTypeBuilder';

export class OutputTypeBuilder {
    private typeCache: TypeCache;
    private modelHelper: ModelHelper;
    private typeResolver: TypeResolver;
    private inputTypeBuilder: InputTypeBuilder;

    constructor(
        typeCache: TypeCache,
        modelHelper: ModelHelper,
        typeResolver: TypeResolver,
        inputTypeBuilder: InputTypeBuilder
    ) {
        this.typeCache = typeCache;
        this.modelHelper = modelHelper;
        this.typeResolver = typeResolver;
        this.inputTypeBuilder = inputTypeBuilder;
    }

    getDistinctEnum(model: string): GraphQLEnumType {
        const name = `${model}DistinctFieldEnum`;
        const existing = this.typeCache.get<GraphQLEnumType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const values: any = {};
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field)) {
                values[fieldName] = { value: fieldName };
            }
        }

        const enumType = new GraphQLEnumType({ name, values });
        this.typeCache.set(name, enumType);
        return enumType;
    }

    getCountAggOutput(model: string): GraphQLObjectType {
        const name = `${model}CountAggregateOutput`;
        const existing = this.typeCache.get<GraphQLObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const fields: any = { _all: { type: GraphQLInt } };
        for (const [fieldName, field] of Object.entries(modelDef.fields)) {
            if (this.modelHelper.isScalar(field)) {
                fields[fieldName] = { type: GraphQLInt };
            }
        }

        const output = new GraphQLObjectType({ name, fields });
        this.typeCache.set(name, output);
        return output;
    }

    getAffectedRowsOutput(): GraphQLObjectType {
        const name = 'affectedRowsOutput';
        let payload = this.typeCache.get<GraphQLObjectType>(name);
        if (payload) return payload;

        payload = new GraphQLObjectType({
            name,
            fields: { count: { type: new GraphQLNonNull(GraphQLInt) } },
        });
        this.typeCache.set(name, payload);
        return payload;
    }

    getOutputType(model: string): GraphQLObjectType {
        const name = model;
        const existing = this.typeCache.get<GraphQLObjectType>(name);
        if (existing) return existing;

        const modelDef = this.modelHelper.getModelDef(model);
        const type = new GraphQLObjectType({
            name,
            fields: () => {
                const fields: any = {};
                const toManyRelations: any[] = [];

                for (const [fieldName, field] of Object.entries(modelDef.fields)) {
                    if (this.modelHelper.isScalar(field)) {
                        fields[fieldName] = { type: this.typeResolver.fieldToGraphQLType(field) };
                    }

                    if (this.modelHelper.isRelation(field)) {
                        const target = this.modelHelper.getTargetModel(field);
                        const targetType = this.getOutputType(target);

                        const fieldConfig: any = {
                            type: field.array
                                ? new GraphQLList(new GraphQLNonNull(targetType))
                                : field.optional
                                    ? targetType
                                    : new GraphQLNonNull(targetType),
                        };

                        if (field.array) {
                            toManyRelations.push({ fieldName, field });
                            fieldConfig.args = {
                                where: { type: this.inputTypeBuilder.getWhereInput(target) },
                                orderBy: { type: new GraphQLList(this.inputTypeBuilder.getOrderByInput(target)) },
                                take: { type: GraphQLInt },
                                skip: { type: GraphQLInt },
                                cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(target) },
                                distinct: { type: new GraphQLList(new GraphQLNonNull(this.getDistinctEnum(target))) },
                            };
                        }

                        fields[fieldName] = fieldConfig;
                    }
                }

                if (toManyRelations.length) {
                    const countTypeName = `${model}_count`;
                    let countType = this.typeCache.get<GraphQLObjectType>(countTypeName);
                    if (!countType) {
                        const countFields: any = {};
                        toManyRelations.forEach(({ fieldName }) => {
                            countFields[fieldName] = {
                                type: GraphQLInt,
                            };
                        });
                        countType = new GraphQLObjectType({
                            name: countTypeName,
                            fields: countFields,
                        });
                        this.typeCache.set(countTypeName, countType);
                    }
                    fields._count = { type: countType };
                }

                return fields;
            },
        });

        this.typeCache.set(name, type);
        return type;
    }
}
