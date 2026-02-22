import { GraphQLDirective } from 'graphql';

export type DirectiveHandler = (value: any, args: any, vars: any, fieldName: string) => any | Promise<any>;

export class DirectiveRegistry {
    private handlers: Record<string, DirectiveHandler>;
    private definitions: GraphQLDirective[];

    constructor(handlers: Record<string, DirectiveHandler> = {}, definitions: GraphQLDirective[] = []) {
        this.handlers = handlers;
        this.definitions = definitions;
    }

    getHandler(name: string): DirectiveHandler | undefined {
        return this.handlers[name];
    }

    registerHandler(name: string, handler: DirectiveHandler): void {
        this.handlers[name] = handler;
    }

    getDefinitions(): GraphQLDirective[] {
        return this.definitions;
    }

    registerDefinition(definition: GraphQLDirective): void {
        this.definitions.push(definition);
    }
}