import {
  Kind,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
  DirectiveNode,
  StringValueNode,
  TypeNode,
  EnumTypeDefinitionNode,
  UnionTypeDefinitionNode
} from 'graphql';
import {
  gql,
  InvalidDirectiveError,
  Transformer,
  TransformerContext
} from 'graphql-transformer-core';
import { iff, printBlock, qref, raw } from 'graphql-mapping-template';
import { ResolverResourceIDs } from 'graphql-transformer-common';

const boolRegex = /^(true|false)$/i
const awsDateRegex = /^([+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([.,]\d+(?!:))?)?(\17[0-5]\d([.,]\d+)?)?([zZ]|([+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?(Z|[+-](?:2[0-3]|[01][0-9])(?::?(?:[0-5][0-9]))?)?$/;
const awsTimeRegex = /^(Z|[+-](?:2[0-3]|[01][0-9])(?::?(?:[0-5][0-9]))?)$/;
const awsDateTimeRegex = /^(?:[1-9]\d{3}-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1\d|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:[1-9]\d(?:0[48]|[2468][048]|[13579][26])|(?:[2468][048]|[13579][26])00)-02-29)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-][01]\d:[0-5]\d:[0-5]\d)$/;
const awsEmailRegex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
const awsUrlRegex = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
const awsPhoneRegex = /^\+?\(?\d+\)?(\s|\-|\.)?\d{1,3}(\s|\-|\.)?\d{4}$/;
const awsIpV6AddressRegex = /^([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(\d{1,3}\.){3}\d{1,3}	$/;
const awsIpV4AddressRegex = /^(((([1]?\d)?\d|2[0-4]\d|25[0-5])\.){3}(([1]?\d)?\d|2[0-4]\d|25[0-5]))|([\da-fA-F]{1,4}(\:[\da-fA-F]{1,4}){7})|(([\da-fA-F]{1,4}:){0,5}::([\da-fA-F]{1,4}:){0,5}[\da-fA-F]{1,4})$/;

const validateString = (x: string) => x === x.toString();
const validateBigInt = (x: string) => { try { BigInt(x); return true; } catch (e) { return false; } };
const validateInt = (x: string) => !Number.isNaN(parseInt(x, 10)); 
const validateFloat = (x: string) => !Number.isNaN(parseFloat(x));
const validateBoolean = (x: string) => boolRegex.test(x);
const validateJson = (x: string) => { try { JSON.parse(x); return true; } catch (e) { return false; } };
const validateAwsDate = (x: string) => awsDateRegex.test(x);
const validateAwsTime = (x: string) => awsTimeRegex.test(x);
const validateAwsDateTime = (x: string) => awsDateTimeRegex.test(x);
const validateAwsEmail = (x: string) => awsEmailRegex.test(x);
const validateAwsUrl = (x: string) => awsUrlRegex.test(x);
const validateAwsPhone = (x: string) => awsPhoneRegex.test(x);
const validateAwsIpAddress = (x: string) => awsIpV6AddressRegex.test(x) || awsIpV4AddressRegex.test(x);

interface Indexable {
  [key: string]: any;
}

class TypeValidators implements Indexable {
  [key: string]: any;
  ID = validateString
  String = validateString
  BigInt = validateBigInt
  Int = validateInt
  Double = validateFloat
  Float = validateFloat
  Boolean = validateBoolean
  AWSJSON = validateJson
  AWSDate = validateAwsDate
  AWSTime = validateAwsTime
  AWSDateTime = validateAwsDateTime
  AWSTimestamp = validateInt
  AWSEmail = validateAwsEmail
  AWSURL = validateAwsUrl
  AWSPhone = validateAwsPhone
  AWSIPAddress = validateAwsIpAddress
}

const nonStringStorageTypes = ['BigInt', 'Int', 'Double', 'Float', 'Boolean'];

class TypeComposition {
  typeSequence: string[] = []
  isList: boolean = false
  isEnum: boolean = false
  isScalar: boolean = false
  hasNonNull: boolean = false
  baseTypeName: string = ''
  enumValues: string[] = []
}

export class DefaultValueTransformer extends Transformer {
  constructor() {
    super(
      'DefaultValueTransformer',
      gql`
        directive @default(value: String!) on FIELD_DEFINITION
      `
    );
  }

  field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
  ): void => {
    const typeName: string = parent.name.value;
    const fieldName: string = definition.name.value;

    this.assertModelDirective(parent.directives!);

    // get field type make up
    const fieldTypeNode: TypeNode = definition.type;
    const fieldTypeComposition: TypeComposition = this.getTypeComposition(fieldTypeNode, ctx);
    // console.log(`current type composition: ${JSON.stringify(fieldTypeComposition)}`);
    this.assertCompatibleFieldType(fieldTypeComposition);

    this.assertValidDirectiveArguments(directive);
    const defaultValueArgumentValueNode: StringValueNode = directive.arguments![0].value as StringValueNode;
    const defaultValue = defaultValueArgumentValueNode.value;

    this.assertFieldTypeAndDefaultValueTypeMatch(fieldTypeComposition, defaultValue);

    const snippet: string = this.createVTLSnippet(fieldName, defaultValue, this.storeAsString(fieldTypeComposition.baseTypeName));
    const createMutationResolverLogicalId: string = ResolverResourceIDs.DynamoDBCreateResolverResourceID(typeName);
    this.augmentResolver(ctx, createMutationResolverLogicalId, snippet);
  };

  private assertModelDirective = (directives: readonly DirectiveNode[]): void => {
    const modelDirective = directives.find(dir => dir.name.value === 'model');
    if (!modelDirective) {
      throw new InvalidDirectiveError(
        'Fields annotated with @default must have parent types annotated with @model.'
      );
    }
  };

  private getTypeComposition = (type: TypeNode, ctx: TransformerContext, composition?: TypeComposition): TypeComposition => {
    if (!composition) composition = new TypeComposition();

    const enums = ctx.getTypeDefinitionsOfKind(Kind.ENUM_TYPE_DEFINITION);
    const interfaces = ctx.getTypeDefinitionsOfKind(Kind.INTERFACE_TYPE_DEFINITION);
    const objects = ctx.getTypeDefinitionsOfKind(Kind.OBJECT_TYPE_DEFINITION);
    const unions = ctx.getTypeDefinitionsOfKind(Kind.UNION_TYPE_DEFINITION);
    
    if (type.kind === Kind.NON_NULL_TYPE) {
      composition.hasNonNull = true;
      composition.typeSequence.push(type.kind);
      return this.getTypeComposition(type.type, ctx, composition);
    } else if (type.kind === Kind.LIST_TYPE) {
      composition.isList = true;
      composition.typeSequence.push(type.kind);
      return this.getTypeComposition(type.type, ctx, composition);
    }
    const theUnsupported = objects.find(o => o.name.value === type.name.value) as ObjectTypeDefinitionNode
     || interfaces.find(i => i.name.value === type.name.value) as InterfaceTypeDefinitionNode
     || unions.find(u => u.name.value === type.name.value) as UnionTypeDefinitionNode;
    const theEnum = enums.find(e => e.name.value === type.name.value) as EnumTypeDefinitionNode;

    if (theUnsupported) {
      composition.baseTypeName = theUnsupported.name.value;
      composition.typeSequence.push(theUnsupported.name.value);
    } else if (theEnum) {
      composition.isEnum = true;
      composition.baseTypeName = theEnum.name.value;
      composition.typeSequence.push(theEnum.name.value);
      composition.enumValues = theEnum.values!.map(v => v.name.value);
    } else {
      composition.isScalar = true
      composition.baseTypeName = type.name.value;
    }
    return composition;
  }

  private assertCompatibleFieldType = (fieldTypeComposition: TypeComposition) => {
    if (fieldTypeComposition.isList || !(fieldTypeComposition.isEnum || fieldTypeComposition.isScalar)) {
      throw new InvalidDirectiveError('Fields annotated with @default must be scalar or enum types.');
    }
  }

  private assertValidDirectiveArguments = (directive: DirectiveNode) => {
    // get directive argument type make up
    if (directive.arguments!.length == 0) throw new InvalidDirectiveError('Directive for @default must declare a value property');
    if (directive.arguments!.length > 1) throw new InvalidDirectiveError('Directive for @default only takes a value property');
  }

  private assertFieldTypeAndDefaultValueTypeMatch = (fieldTypeComposition: TypeComposition, defaultValueInput: string) => {
    // if field type is non-nullable, ensure value is not null
    if (defaultValueInput == null) {
      throw new InvalidDirectiveError(`Directive for @default does not support null values.`);
    }

    // if base field type is enum, may be an enum - validate that argument value in among field type enum's values
    if (fieldTypeComposition.isEnum && !fieldTypeComposition.enumValues!.find(v => v === defaultValueInput)) {
      throw new InvalidDirectiveError(`Default value "${defaultValueInput}" is not a member of enum ${fieldTypeComposition.baseTypeName}.`);
    }
    const typeValidators = new TypeValidators();
    if (!fieldTypeComposition.isEnum && !typeValidators[fieldTypeComposition.baseTypeName](defaultValueInput)){
      // if field type is non-string scalar, verify value matches type
      throw new InvalidDirectiveError(`Default value "${defaultValueInput}" is not a valid ${fieldTypeComposition.baseTypeName}.`);
    }

    // const isAScalarOrEnum = isScalarOrEnum(field.type, ctx.getTypeDefinitionsOfKind(Kind.ENUM_TYPE_DEFINITION) as EnumTypeDefinitionNode[]);
    // EnumTypeDefinitionNodes have a `values` property made up of EnumValueDefinitionNodes, and EnumValueDefinitionNode has a `name` property that is a NameNode with a `value` property that is the enum string value
    
    // todo: consider limit checking for Int, etc
    //   if (num > MAX_INT || num < MIN_INT) {
    //     throw new GraphQLError(
    //       `Int cannot represent non 32-bit signed integer value: ${valueNode.value}`,
    //       valueNode,
    //     );
    //   }
  };

  storeAsString = (typeName: string) => !nonStringStorageTypes.includes(typeName);

  private createVTLSnippet = (fieldName: string, defaultValue: any, isString: boolean): string => {
    const formattedDefaultValue = isString ? `"${defaultValue}"` : `${defaultValue}`;
    return printBlock(`Setting "${fieldName}" to default value of ${formattedDefaultValue}`)(
      iff(raw(`$util.isNull($ctx.args.input.${fieldName})`), qref(`$ctx.args.input.put("${fieldName}", ${formattedDefaultValue})`))
    );
  };

  private augmentResolver = (
    ctx: TransformerContext,
    resolverLogicalId: string,
    snippet: string
  ): void => {
    const resolver = ctx.getResource(resolverLogicalId);
    if (resolver) {
      resolver.Properties!.RequestMappingTemplate = snippet + '\n\n' + resolver.Properties!.RequestMappingTemplate;
      ctx.setResource(resolverLogicalId, resolver);
    }
  };
}