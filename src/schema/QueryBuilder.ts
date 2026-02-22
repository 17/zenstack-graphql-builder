import {
    GraphQLObjectType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLInt,
    GraphQLBoolean,
} from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';
import { JsonScalar } from '../types/scalars';

export class QueryBuilder {
    private typeCache: TypeCache;
    private inputTypeBuilder: InputTypeBuilder;
    private outputTypeBuilder: OutputTypeBuilder;

    constructor(
        typeCache: TypeCache,
        inputTypeBuilder: InputTypeBuilder,
        outputTypeBuilder: OutputTypeBuilder
    ) {
        this.typeCache = typeCache;
        this.inputTypeBuilder = inputTypeBuilder;
        this.outputTypeBuilder = outputTypeBuilder;
    }

    buildQueryFields(modelNames: string[]): any {
        const queryFields: any = {};

        for (const model of modelNames) {
            const lower = model[0].toLowerCase() + model.slice(1);

            queryFields[`${lower}_findUnique`] = {
                type: this.outputTypeBuilder.getOutputType(model),
                args: {
                    where: { type: new GraphQLNonNull(this.inputTypeBuilder.getWhereUniqueInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            queryFields[`${lower}_findUniqueOrThrow`] = {
                type: new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model)),
                args: {
                    where: { type: new GraphQLNonNull(this.inputTypeBuilder.getWhereUniqueInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            queryFields[`${lower}_findFirst`] = {
                type: this.outputTypeBuilder.getOutputType(model),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getOrderByInput(model))) },
                    cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getDistinctEnum(model))) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            queryFields[`${lower}_findFirstOrThrow`] = {
                type: new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model)),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getOrderByInput(model))) },
                    cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getDistinctEnum(model))) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            queryFields[`${lower}_findMany`] = {
                type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model))),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getOrderByInput(model))) },
                    cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    distinct: { type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getDistinctEnum(model))) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            queryFields[`${lower}_count`] = {
                type: this.outputTypeBuilder.getCountAggOutput(model),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getOrderByInput(model))) },
                    cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                },
            };

            queryFields[`${lower}_aggregate`] = {
                type: new GraphQLNonNull(JsonScalar),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    orderBy: { type: new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getOrderByInput(model))) },
                    cursor: { type: this.inputTypeBuilder.getWhereUniqueInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    _count: { type: this.inputTypeBuilder.getCountAggInput(model) },
                    _avg: { type: this.inputTypeBuilder.getAggInput(model) },
                    _sum: { type: this.inputTypeBuilder.getAggInput(model) },
                    _min: { type: this.inputTypeBuilder.getAggInput(model) },
                    _max: { type: this.inputTypeBuilder.getAggInput(model) },
                },
            };

            queryFields[`${lower}_groupBy`] = {
                type: new GraphQLList(new GraphQLNonNull(JsonScalar)),
                args: {
                    by: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getDistinctEnum(model)))) },
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    having: { type: this.inputTypeBuilder.getWhereInput(model) },
                    take: { type: GraphQLInt },
                    skip: { type: GraphQLInt },
                    _count: { type: this.inputTypeBuilder.getCountAggInput(model) },
                    _avg: { type: this.inputTypeBuilder.getAggInput(model) },
                    _sum: { type: this.inputTypeBuilder.getAggInput(model) },
                    _min: { type: this.inputTypeBuilder.getAggInput(model) },
                    _max: { type: this.inputTypeBuilder.getAggInput(model) },
                },
            };

            queryFields[`${lower}_exists`] = {
                type: new GraphQLNonNull(GraphQLBoolean),
                args: { where: { type: this.inputTypeBuilder.getWhereInput(model) } },
            };
        }

        return queryFields;
    }
}
