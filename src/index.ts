import { GraphQLSchema, GraphQLDirective } from 'graphql';
import { TypeCache } from './types/TypeCache';
import { FilterBuilder } from './types/FilterBuilder';
import { EnumBuilder } from './types/EnumBuilder';
import { InputTypeBuilder } from './types/InputTypeBuilder';
import { OutputTypeBuilder } from './types/OutputTypeBuilder';
import { DirectiveRegistry, DirectiveHandler } from './directives/DirectiveRegistry';
import { DirectiveExtractor } from './directives/DirectiveExtractor';
import { DirectiveApplier } from './directives/DirectiveApplier';
import { SecurityPolicy, SecurityOptions } from './security/SecurityPolicy';
import { QueryBuilder } from './schema/QueryBuilder';
import { MutationBuilder } from './schema/MutationBuilder';
import { SchemaGenerator } from './schema/SchemaGenerator';
import { RootResolver, AllCrudOperations } from './resolvers/RootResolver';
import { ModelHelper, TypeResolver } from './utils/schemaHelper';
import { GraphQLScalarType } from 'graphql';
import {
    DateTimeScalar,
    JsonScalar,
    BigIntScalar,
    BytesScalar,
    DecimalScalar,
    JSONIntScalar,
} from './types/scalars';
import { GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLID } from 'graphql';

export interface BuilderOptions extends Partial<SecurityOptions> {
    useJSONIntScalar?: boolean;
}

export interface ZenStackGraphQLBuilderConfig {
    schema: any; // ZenStack SchemaDef
    options?: BuilderOptions;
    directives?: Record<string, DirectiveHandler>;
    directiveDefinitions?: GraphQLDirective[];
    operations?: string[];
    scalars?: Record<string, GraphQLScalarType>;
}

export class ZenStackGraphQLBuilder {
    private zenSchema: any;
    private modelNames: string[];
    public options: BuilderOptions;
    private customDirectives: Record<string, DirectiveHandler>;
    private directiveDefinitions: GraphQLDirective[];
    private operations: string[];
    private scalars: Record<string, GraphQLScalarType>;

    private outputSchema: GraphQLSchema | null = null;
    private outputRootValue: Record<string, Function> | null = null;

    constructor(config: ZenStackGraphQLBuilderConfig) {
        this.zenSchema = config.schema;
        this.modelNames = Object.keys(config.schema.models);
        this.options = {
            maxDepth: 9,
            maxTake: 100,
            throwOnError: false,
            useJSONIntScalar: false,
            ...config.options,
        };
        this.customDirectives = config.directives || {};
        this.directiveDefinitions = config.directiveDefinitions || [];
        this.operations = config.operations || AllCrudOperations;
        this.scalars = this.initializeScalars(config.scalars);

        this.build();
    }

    private initializeScalars(customScalars: Record<string, GraphQLScalarType> = {}) {
        return {
            String: GraphQLString,
            Int: this.options.useJSONIntScalar ? JSONIntScalar : GraphQLInt,
            Float: GraphQLFloat,
            Boolean: GraphQLBoolean,
            ID: GraphQLID,
            DateTime: DateTimeScalar,
            Json: JsonScalar,
            BigInt: BigIntScalar,
            Bytes: BytesScalar,
            Decimal: DecimalScalar,
            ...customScalars,
        };
    }

    private build() {
        // 1. Core / Types Layer
        const typeCache = new TypeCache();
        const modelHelper = new ModelHelper(this.zenSchema);
        const enumBuilder = new EnumBuilder(typeCache);
        const typeResolver = new TypeResolver(typeCache, this.scalars);

        // 初始化并缓存预定义枚举
        enumBuilder.buildEnums(this.zenSchema);

        const filterBuilder = new FilterBuilder(typeCache, this.scalars);
        const inputTypeBuilder = new InputTypeBuilder(typeCache, filterBuilder, modelHelper, typeResolver);
        const outputTypeBuilder = new OutputTypeBuilder(typeCache, modelHelper, typeResolver, inputTypeBuilder);

        // 预热所有相关类型的构建（与原 index.js 保持一致的行为）
        for (const model of this.modelNames) {
            outputTypeBuilder.getOutputType(model);
            inputTypeBuilder.getWhereInput(model);
            inputTypeBuilder.getOrderByInput(model);
            inputTypeBuilder.getCreateInput(model);
            inputTypeBuilder.getUpdateInput(model);
            inputTypeBuilder.getWhereUniqueInput(model);
            inputTypeBuilder.getCreateManyInput(model);
            outputTypeBuilder.getCountAggOutput(model);
            outputTypeBuilder.getDistinctEnum(model);
            inputTypeBuilder.getOmitInput(model);
            inputTypeBuilder.getCountAggInput(model);
            inputTypeBuilder.getAggInput(model);
            inputTypeBuilder.getConnectOrCreateInput(model);
            inputTypeBuilder.getUpdateNestedInput(model);
            inputTypeBuilder.getUpdateManyNestedInput(model);
            inputTypeBuilder.getUpsertNestedInput(model);
        }
        outputTypeBuilder.getAffectedRowsOutput();

        // 2. Directives Layer
        const directiveRegistry = new DirectiveRegistry(this.customDirectives, this.directiveDefinitions);

        // 3. Schema Layer
        const queryBuilder = new QueryBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);
        const mutationBuilder = new MutationBuilder(typeCache, inputTypeBuilder, outputTypeBuilder);
        const schemaGenerator = new SchemaGenerator(
            queryBuilder,
            mutationBuilder,
            typeCache,
            directiveRegistry,
            this.modelNames
        );

        this.outputSchema = schemaGenerator.generate();

        // 4. Resolvers Layer
        const dummyPolicy = new SecurityPolicy(this.options);
        const extractor = new DirectiveExtractor(dummyPolicy);
        const applier = new DirectiveApplier(directiveRegistry);
        const rootResolver = new RootResolver(this.modelNames, this.operations, extractor, applier);

        this.outputRootValue = rootResolver.buildRootValue();
    }

    getSchema(): GraphQLSchema {
        if (!this.outputSchema) throw new Error('Schema not generated yet');
        return this.outputSchema;
    }

    getRootResolver(): Record<string, Function> {
        if (!this.outputRootValue) throw new Error('RootResolver not generated yet');
        return this.outputRootValue;
    }
}
