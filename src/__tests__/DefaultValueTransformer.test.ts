import {
    ObjectTypeDefinitionNode, parse, DocumentNode,
    Kind, InputObjectTypeDefinitionNode, FieldDefinitionNode
} from 'graphql'
import GraphQLTransform from 'graphql-transformer-core'
import { ResourceConstants, ResolverResourceIDs, ModelResourceIDs } from 'graphql-transformer-common'
import { DefaultValueTransformer } from '../DefaultValueTransformer'
import AppSyncTransformer from 'graphql-appsync-transformer'
import DynamoDBModelTransformer from 'graphql-dynamodb-transformer'
import { findAddedNonNullDirectiveArgs } from 'graphql/utilities/findBreakingChanges';

const getType = (schemaDoc: DocumentNode) => (name: string): ObjectTypeDefinitionNode =>
    schemaDoc.definitions.find(d => d.kind !== Kind.SCHEMA_DEFINITION ? d.name.value === name : false) as ObjectTypeDefinitionNode
const getField = (input: ObjectTypeDefinitionNode, field: string) => input.fields.find(f => f.name.value === field)

test('Test DefaultValueTransformer validation happy case', () => {
    const validSchema = `
    type Post @model {
        id: ID!
        title: String @default(value: "hello world")
        viewCount: Int @default(value: "9001")
        createdAt: String
        updatedAt: String
    }
    `
    const transformer = new GraphQLTransform({
        transformers: [
            new AppSyncTransformer(),
            new DynamoDBModelTransformer(),
            new DefaultValueTransformer()
        ]
    })
    const out = transformer.transform(validSchema);
    // tslint:disable-next-line
    const schemaDoc = parse(out.Resources[ResourceConstants.RESOURCES.GraphQLSchemaLogicalID].Properties.Definition)
    expect(out).toBeDefined()
    expect(getField(getType(schemaDoc)('Post'), 'title')).toBeDefined()

    const postCreateMappingTemplate = out.Resources[ResolverResourceIDs.DynamoDBCreateResolverResourceID('Post')].Properties.RequestMappingTemplate;
    const titleSnippet = `#if( $util.isNull($ctx.args.input.viewCount) )
$util.qr($ctx.args.input.put("viewCount", 9001))
#end`
    const viewCountSnippet = `#if( $util.isNull($ctx.args.input.title) )
$util.qr($ctx.args.input.put("title", "hello world"))
#end`

    expect(postCreateMappingTemplate).toContain(titleSnippet)
    expect(postCreateMappingTemplate).toContain(viewCountSnippet)
});
