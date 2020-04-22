// import { parse } from 'graphql'
// import { ResourceConstants, ResolverResourceIDs, ModelResourceIDs } from 'graphql-transformer-common'
import { GraphQLTransform } from 'graphql-transformer-core'
import { DefaultValueTransformer } from '../DefaultValueTransformer'
import { DynamoDBModelTransformer } from 'graphql-dynamodb-transformer'
import { GraphQLTransformOptions } from 'graphql-transformer-core/lib/GraphQLTransform'



test('Test DefaultValueTransformer validation happy case', () => {
    const validSchema: string = `
    type Post @model {
        id: ID!
        title: String @default(value: "hello world")
        viewCount: Int @default(value: "9001")
        createdAt: String
        updatedAt: String
        tag: Tag @default(value: "RANDOM")
    }
    enum Tag {
        NEWS
        RANDOM
    }
    `

    const options: GraphQLTransformOptions = {
        transformers: [
            new DynamoDBModelTransformer(),
            new DefaultValueTransformer()
        ]
    };
    const transformer = new GraphQLTransform(options)
    const out = transformer.transform(validSchema);

    expect(out).toBeDefined()

    const postCreateMappingTemplate = out.resolvers['Mutation.createPost.req.vtl'];
    const titleSnippet = `#if( $util.isNull($ctx.args.input.viewCount) )
  $util.qr($ctx.args.input.put("viewCount", 9001))
#end`
    const viewCountSnippet = `#if( $util.isNull($ctx.args.input.title) )
  $util.qr($ctx.args.input.put("title", "hello world"))
#end`

    expect(postCreateMappingTemplate).toContain(titleSnippet)
    expect(postCreateMappingTemplate).toContain(viewCountSnippet)
});
