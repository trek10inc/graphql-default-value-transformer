import { Transformer, TransformerContext, InvalidDirectiveError, TransformerContractError } from "graphql-transformer-core";
import {
    valueFromASTUntyped,
    ArgumentNode,
    FieldDefinitionNode,
    ObjectTypeDefinitionNode,
    DirectiveNode,
    Kind,
    IntValueNode,
    StringValueNode,
    NamedTypeNode
} from "graphql";
import { printBlock, compoundExpression, iff, set, ref, qref, obj, str, raw, equals } from 'graphql-mapping-template'
import {
    ResourceConstants, blankObject, makeSchema,
    makeOperationType,
    ModelResourceIDs,
    ResolverResourceIDs,
    makeInputValueDefinition,
    makeNonNullType,
    makeNamedType,
    getBaseType,
    makeField
} from "graphql-transformer-common";
import { getArgumentValues } from "graphql/execution/values";

export class DefaultValueTransformer extends Transformer {

    constructor() {
        super(
            'DefaultValueTransformer',
            `directive @default(value: String) on FIELD_DEFINITION`
        )
    }

    /**
     * When a field is annotated with @default(value: "value") the mapping template will default if not set by the user.
     *
     * Usage:
     *
     * type Post @model {
     *   id: ID!
     *   title: String @default(value: "Hello World")
     *   version: Int!
     * }
     *
     * If a value is set by the client, use that, otherwise
     * default to what is in the value of the @default directive.
     */
    public field = (parent: ObjectTypeDefinitionNode, def: FieldDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void => {
        // @versioned may only be used on types that are also @model
        const modelDirective = parent.directives.find((dir) => dir.name.value === 'model')
        if (!modelDirective) {
            throw new InvalidDirectiveError('Fields annotated with @default must also belong to types annotated with @model.')
        }

        if(directive.arguments.length != 1){
            throw new InvalidDirectiveError('Fields annotated with @default must declare a single argument and value.')
        }

        let defaultArgValue
        let fieldType
        if((<IntValueNode|StringValueNode>directive.arguments[0].value).value){
            defaultArgValue = (<IntValueNode|StringValueNode>directive.arguments[0].value).value
        } else {
            throw new InvalidDirectiveError('Directive for @default must declare a value property')
        }

        if((<NamedTypeNode>def.type).name.value){
            fieldType = (<NamedTypeNode>def.type).name.value
        } else {
            throw new InvalidDirectiveError('Directive for @default must declare a value property')
        }

        let defaultValue;
        switch(fieldType){
            case "String":
                defaultValue = `"${defaultArgValue}"`
                break;
            case "Int":
                defaultValue = `${defaultArgValue}`
                break;
            default:
                throw new InvalidDirectiveError('Fields annotated with @default must declare a single argument and value.')
        }

        const typeName = parent.name.value
        const fieldName = def.name.value

        this.augmentCreateMutation(ctx, typeName, fieldName, defaultValue)
    }

    /**
     * Set the field to the default value on create if not set otherwise.
     * @param ctx
     * @param typeName
     * @param fieldName
     * @param defaultValue
     */
    private augmentCreateMutation(ctx: TransformerContext, typeName: string, fieldName: string, defaultValue: any) {
        const snippet = printBlock(`Setting "${fieldName}" to default to ${defaultValue}`)(
            iff(raw(`$util.isNull($ctx.args.input.${fieldName})`), qref(`$ctx.args.input.put("${fieldName}", ${defaultValue})`))
        )
        const mutationResolverLogicalId = ResolverResourceIDs.DynamoDBCreateResolverResourceID(typeName)
        const resolver = ctx.getResource(mutationResolverLogicalId)
        if (resolver) {
            resolver.Properties.RequestMappingTemplate = snippet + '\n\n' + resolver.Properties.RequestMappingTemplate
            ctx.setResource(mutationResolverLogicalId, resolver)
        }
    }
}
