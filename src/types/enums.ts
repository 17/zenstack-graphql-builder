import { GraphQLEnumType } from 'graphql';

export const SortOrderEnum = new GraphQLEnumType({
    name: 'SortOrder',
    values: { asc: { value: 'asc' }, desc: { value: 'desc' } },
});

export const NullsOrderEnum = new GraphQLEnumType({
    name: 'NullsOrder',
    values: { first: { value: 'first' }, last: { value: 'last' } },
});

export const QueryModeEnum = new GraphQLEnumType({
    name: 'QueryMode',
    values: { default: { value: 'default' }, insensitive: { value: 'insensitive' } },
});
