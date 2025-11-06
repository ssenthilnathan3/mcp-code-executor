/**
 * TypeMapper - Converts JSON Schema definitions to TypeScript types
 * 
 * This module handles the conversion of JSON Schema objects into idiomatic
 * TypeScript type definitions, supporting primitives, arrays, objects, unions,
 * enums, and complex nested structures.
 */

import type { JSONSchema, TypeDefinition } from '../types/index.js';

/**
 * Maps JSON Schema types to TypeScript primitive types
 */
const PRIMITIVE_TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  null: 'null',
  array: 'unknown[]',
  object: 'Record<string, unknown>',
};

/**
 * Options for type generation
 */
export interface TypeMapperOptions {
  /** Whether to generate strict types (default: true) */
  strictTypes?: boolean;
  /** Prefix for generated interface names */
  interfacePrefix?: string;
  /** Whether to include JSDoc comments */
  includeDocumentation?: boolean;
}

/**
 * Context for tracking type generation state
 */
interface GenerationContext {
  /** Generated interface names to avoid duplicates */
  generatedInterfaces: Set<string>;
  /** Counter for anonymous interface naming */
  anonymousCounter: number;
  /** Dependencies collected during generation */
  dependencies: Set<string>;
}

/**
 * TypeMapper class for converting JSON Schema to TypeScript types
 */
export class TypeMapper {
  private options: Required<TypeMapperOptions>;

  constructor(options: TypeMapperOptions = {}) {
    this.options = {
      strictTypes: true,
      interfacePrefix: '',
      includeDocumentation: true,
      ...options,
    };
  }

  /**
   * Maps a JSON Schema to a TypeScript type definition
   */
  mapJsonSchemaToTypeScript(schema: JSONSchema, name?: string): TypeDefinition {
    const context: GenerationContext = {
      generatedInterfaces: new Set(),
      anonymousCounter: 0,
      dependencies: new Set(),
    };

    const typeString = this.mapSchemaToType(schema, context, name);
    const isInterface = this.isInterfaceType(schema);

    const result: TypeDefinition = {
      typeString,
      isInterface,
      dependencies: Array.from(context.dependencies),
    };

    if (isInterface && name) {
      result.name = this.sanitizeInterfaceName(name);
    }

    return result;
  }

  /**
   * Generates a TypeScript interface from a schema
   */
  generateInterface(name: string, properties: Record<string, JSONSchema>, required: string[] = []): string {
    const context: GenerationContext = {
      generatedInterfaces: new Set(),
      anonymousCounter: 0,
      dependencies: new Set(),
    };

    const interfaceName = this.sanitizeInterfaceName(name);
    const propertyStrings: string[] = [];

    for (const [propName, propSchema] of Object.entries(properties)) {
      const isRequired = required.length === 0 || required.includes(propName);
      const propertyType = this.mapSchemaToType(propSchema, context);
      const optionalMarker = isRequired ? '' : '?';
      
      let propertyString = `  ${propName}${optionalMarker}: ${propertyType};`;
      
      if (this.options.includeDocumentation && propSchema.description) {
        propertyString = `  /** ${propSchema.description} */\n${propertyString}`;
      }
      
      propertyStrings.push(propertyString);
    }

    let interfaceString = `export interface ${interfaceName} {\n${propertyStrings.join('\n')}\n}`;
    
    if (this.options.includeDocumentation) {
      interfaceString = `/**\n * Generated interface\n */\n${interfaceString}`;
    }

    return interfaceString;
  }

  /**
   * Handles union types (anyOf, oneOf)
   */
  handleUnionTypes(schemas: JSONSchema[]): string {
    const context: GenerationContext = {
      generatedInterfaces: new Set(),
      anonymousCounter: 0,
      dependencies: new Set(),
    };

    const types = schemas.map(schema => this.mapSchemaToType(schema, context));
    return types.join(' | ');
  }

  /**
   * Maps a single schema to TypeScript type string
   */
  private mapSchemaToType(schema: JSONSchema, context: GenerationContext, name?: string): string {
    // Handle null schema
    if (!schema) {
      return 'unknown';
    }

    // Handle enum types
    if (schema.enum) {
      return this.handleEnumType(schema.enum);
    }

    // Handle union types
    if (schema.anyOf) {
      return this.handleUnionTypes(schema.anyOf);
    }

    if (schema.oneOf) {
      return this.handleUnionTypes(schema.oneOf);
    }

    // Handle allOf (intersection types)
    if (schema.allOf) {
      return this.handleIntersectionTypes(schema.allOf, context);
    }

    // Handle array types
    if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
      return this.handleArrayType(schema, context);
    }

    // Handle object types
    if (schema.type === 'object' || schema.properties) {
      return this.handleObjectType(schema, context, name);
    }

    // Handle primitive types
    if (typeof schema.type === 'string') {
      return PRIMITIVE_TYPE_MAP[schema.type] || 'unknown';
    }

    // Handle multiple types
    if (Array.isArray(schema.type)) {
      const types = schema.type.map(type => PRIMITIVE_TYPE_MAP[type] || 'unknown');
      return types.join(' | ');
    }

    return 'unknown';
  }

  /**
   * Handles enum type generation
   */
  private handleEnumType(enumValues: unknown[]): string {
    const literalTypes = enumValues.map(value => {
      if (typeof value === 'string') {
        return `'${value.replace(/'/g, "\\'")}'`;
      }
      if (typeof value === 'number') {
        return value.toString();
      }
      if (typeof value === 'boolean') {
        return value.toString();
      }
      return JSON.stringify(value);
    });

    return literalTypes.join(' | ');
  }

  /**
   * Handles array type generation
   */
  private handleArrayType(schema: JSONSchema, context: GenerationContext): string {
    if (!schema.items) {
      return 'unknown[]';
    }

    const itemType = this.mapSchemaToType(schema.items, context);
    return `${itemType}[]`;
  }

  /**
   * Handles object type generation
   */
  private handleObjectType(schema: JSONSchema, context: GenerationContext, name?: string): string {
    if (!schema.properties) {
      // Handle additionalProperties
      if (schema.additionalProperties === true) {
        return 'Record<string, unknown>';
      }
      if (typeof schema.additionalProperties === 'object') {
        const valueType = this.mapSchemaToType(schema.additionalProperties, context);
        return `Record<string, ${valueType}>`;
      }
      return 'Record<string, unknown>';
    }

    // Generate inline object type for simple cases or when no name is provided
    if (!name && Object.keys(schema.properties).length <= 3) {
      return this.generateInlineObjectType(schema, context);
    }

    // Generate named interface for complex objects
    if (name) {
      const interfaceName = this.sanitizeInterfaceName(name);
      context.dependencies.add(interfaceName);
      return interfaceName;
    }

    // For complex objects without names, still generate inline
    return this.generateInlineObjectType(schema, context);
  }

  /**
   * Generates inline object type for simple objects
   */
  private generateInlineObjectType(schema: JSONSchema, context: GenerationContext): string {
    if (!schema.properties) {
      return 'Record<string, unknown>';
    }

    const required = schema.required || [];
    const propertyStrings: string[] = [];

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const isRequired = required.length === 0 || required.includes(propName);
      const propertyType = this.mapSchemaToType(propSchema, context);
      const optionalMarker = isRequired ? '' : '?';
      propertyStrings.push(`${propName}${optionalMarker}: ${propertyType}`);
    }

    return `{ ${propertyStrings.join('; ')} }`;
  }

  /**
   * Handles intersection types (allOf)
   */
  private handleIntersectionTypes(schemas: JSONSchema[], context: GenerationContext): string {
    const types = schemas.map(schema => this.mapSchemaToType(schema, context));
    return types.join(' & ');
  }

  /**
   * Checks if a schema should generate an interface
   */
  private isInterfaceType(schema: JSONSchema): boolean {
    return !!(schema && schema.properties && Object.keys(schema.properties).length > 0);
  }

  /**
   * Sanitizes interface names to be valid TypeScript identifiers
   */
  private sanitizeInterfaceName(name: string): string {
    // Convert to PascalCase and remove invalid characters
    const sanitized = name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&')
      .split('_')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');

    return this.options.interfacePrefix + (sanitized || 'Anonymous');
  }

  /**
   * Generates anonymous interface names
   */
  private generateAnonymousInterfaceName(context: GenerationContext): string {
    const name = `${this.options.interfacePrefix}Anonymous${context.anonymousCounter++}`;
    context.generatedInterfaces.add(name);
    return name;
  }
}