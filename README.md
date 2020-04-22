# graphql-default-value-transformer

Add default values to fields in GraphQL schemas for AWS Amplify. Confirmed working with Amplify CLI 4.17.2.

## installation

Amplify CLI requires custom transformers to be installed globally as of right now:

```
npm i -g graphql-default-value-transformer
```

## configuration

In your Amplify project, find the `transform.conf.json` file under `<project-path>/amplify/backend/api/<your-api-name>/`. Add the npm package name for this transformer - `graphql-default-value-transformer` - to the `transformers` property:

```
{
  "transformers": [
    "graphql-default-value-transformer"
  ]
}
```

## usage

Supply the `@default` directive with a single `value` parameter on any scalar/enum field under a `@model`. The `value` parameter must be formatted as a string regardless of the corresponding field type.

```
type Post @model {
  id: ID!
  title: String! @default(value: "hello world")
  viewCount: Int @default(value: "9001")
  tag: Tag @default(value: "RANDOM")
}
enum Tag {
  NEWS
  RANDOM
}
```

## limitations

This transformer only supports scalar and enum types, include the AWS specific types (e.g.: `AWSDateTime`).

## license

MIT