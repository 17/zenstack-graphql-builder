import {
    GraphQLList,
    GraphQLNonNull,
    GraphQLInt,
    GraphQLBoolean,
} from 'graphql';
import { TypeCache } from '../types/TypeCache';
import { InputTypeBuilder } from '../types/InputTypeBuilder';
import { OutputTypeBuilder } from '../types/OutputTypeBuilder';

export class MutationBuilder {
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

    buildMutationFields(modelNames: string[]): any {
        const mutationFields: any = {};

        for (const model of modelNames) {
            const lower = model[0].toLowerCase() + model.slice(1);

            mutationFields[`${lower}_create`] = {
                type: new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model)),
                args: {
                    data: { type: new GraphQLNonNull(this.inputTypeBuilder.getCreateInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_createMany`] = {
                type: this.outputTypeBuilder.getAffectedRowsOutput(),
                args: {
                    data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getCreateManyInput(model)))) },
                    skipDuplicates: { type: GraphQLBoolean },
                },
            };

            mutationFields[`${lower}_createManyAndReturn`] = {
                type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model))),
                args: {
                    data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(this.inputTypeBuilder.getCreateManyInput(model)))) },
                    skipDuplicates: { type: GraphQLBoolean },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_update`] = {
                type: this.outputTypeBuilder.getOutputType(model),
                args: {
                    where: { type: new GraphQLNonNull(this.inputTypeBuilder.getWhereUniqueInput(model)) },
                    data: { type: new GraphQLNonNull(this.inputTypeBuilder.getUpdateInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_updateMany`] = {
                type: this.outputTypeBuilder.getAffectedRowsOutput(),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    data: { type: new GraphQLNonNull(this.inputTypeBuilder.getUpdateInput(model)) },
                    limit: { type: GraphQLInt },
                },
            };

            mutationFields[`${lower}_updateManyAndReturn`] = {
                type: new GraphQLList(new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model))),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    data: { type: new GraphQLNonNull(this.inputTypeBuilder.getUpdateInput(model)) },
                    limit: { type: GraphQLInt },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_upsert`] = {
                type: new GraphQLNonNull(this.outputTypeBuilder.getOutputType(model)),
                args: {
                    where: { type: new GraphQLNonNull(this.inputTypeBuilder.getWhereUniqueInput(model)) },
                    create: { type: new GraphQLNonNull(this.inputTypeBuilder.getCreateInput(model)) },
                    update: { type: new GraphQLNonNull(this.inputTypeBuilder.getUpdateInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_delete`] = {
                type: this.outputTypeBuilder.getOutputType(model),
                args: {
                    where: { type: new GraphQLNonNull(this.inputTypeBuilder.getWhereUniqueInput(model)) },
                    omit: { type: this.inputTypeBuilder.getOmitInput(model) },
                },
            };

            mutationFields[`${lower}_deleteMany`] = {
                type: this.outputTypeBuilder.getAffectedRowsOutput(),
                args: {
                    where: { type: this.inputTypeBuilder.getWhereInput(model) },
                    limit: { type: GraphQLInt },
                },
            };
        }

        return mutationFields;
    }
}
