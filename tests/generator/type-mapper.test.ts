/**
 * Test suite for TypeMapper class
 * 
 * Tests JSON Schema to TypeScript type conversion with various schema patterns
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeMapper } from '../../src/generator/type-mapper.js';
import type { JSONSchema } from '../../src/types/index.js';

describe('TypeMapper', () => {
  let typeMapper: TypeMapper;

  beforeEach(() => {
    typeMapper = new TypeMapper();
  });

  describe('Primitive Types', () => {
    it('should map string type correctly', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string');
      expect(result.isInterface).toBe(false);
      expect(result.dependencies).toEqual([]);
    });

    it('should map number type correctly', () => {
      const schema: JSONSchema = { type: 'number' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('number');
      expect(result.isInterface).toBe(false);
    });

    it('should map integer type to number', () => {
      const schema: JSONSchema = { type: 'integer' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('number');
    });

    it('should map boolean type correctly', () => {
      const schema: JSONSchema = { type: 'boolean' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('boolean');
    });

    it('should map null type correctly', () => {
      const schema: JSONSchema = { type: 'null' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('null');
    });

    it('should handle multiple primitive types as union', () => {
      const schema: JSONSchema = { type: ['string', 'number'] };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string | number');
    });

    it('should handle unknown types as unknown', () => {
      const schema: JSONSchema = { type: 'invalid' as any };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('unknown');
    });
  });

  describe('Array Types', () => {
    it('should map simple array types', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string[]');
    });

    it('should map array without items as unknown[]', () => {
      const schema: JSONSchema = { type: 'array' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('unknown[]');
    });

    it('should map nested arrays', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' }
        }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('number[][]');
    });

    it('should map arrays of objects', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' }
          },
          required: ['id', 'name']
        }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('{ id: number; name: string }[]');
    });
  });

  describe('Object Types', () => {
    it('should map simple objects as inline types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('{ name: string; age: number }');
    });

    it('should handle required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name']
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('{ name: string; age?: number }');
    });

    it('should map objects without properties as Record<string, unknown>', () => {
      const schema: JSONSchema = { type: 'object' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('Record<string, unknown>');
    });

    it('should handle additionalProperties', () => {
      const schema: JSONSchema = {
        type: 'object',
        additionalProperties: { type: 'string' }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('Record<string, string>');
    });

    it('should generate named interface for complex objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' }
        }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema, 'User');
      
      expect(result.typeString).toBe('User');
      expect(result.isInterface).toBe(true);
      expect(result.name).toBe('User');
      expect(result.dependencies).toContain('User');
    });
  });

  describe('Enum Types', () => {
    it('should map string enums as literal union types', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['red', 'green', 'blue']
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe("'red' | 'green' | 'blue'");
    });

    it('should map number enums', () => {
      const schema: JSONSchema = {
        type: 'number',
        enum: [1, 2, 3]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('1 | 2 | 3');
    });

    it('should map boolean enums', () => {
      const schema: JSONSchema = {
        type: 'boolean',
        enum: [true, false]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('true | false');
    });

    it('should map mixed type enums', () => {
      const schema: JSONSchema = {
        enum: ['active', 1, true, null]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe("'active' | 1 | true | null");
    });

    it('should escape quotes in string enums', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ["it's", 'say "hello"']
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe("'it\\'s' | 'say \"hello\"'");
    });
  });

  describe('Union Types', () => {
    it('should handle anyOf unions', () => {
      const schema: JSONSchema = {
        anyOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string | number');
    });

    it('should handle oneOf unions', () => {
      const schema: JSONSchema = {
        oneOf: [
          { type: 'string' },
          { type: 'boolean' }
        ]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string | boolean');
    });

    it('should handle complex union types', () => {
      const schema: JSONSchema = {
        anyOf: [
          {
            type: 'object',
            properties: { type: { enum: ['user'] }, name: { type: 'string' } }
          },
          {
            type: 'object',
            properties: { type: { enum: ['admin'] }, permissions: { type: 'array', items: { type: 'string' } } }
          }
        ]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toContain('|');
      expect(result.typeString).toContain("'user'");
      expect(result.typeString).toContain("'admin'");
    });
  });

  describe('Intersection Types', () => {
    it('should handle allOf intersections', () => {
      const schema: JSONSchema = {
        allOf: [
          {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name']
          },
          {
            type: 'object',
            properties: { age: { type: 'number' } },
            required: ['age']
          }
        ]
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('{ name: string } & { age: number }');
    });
  });

  describe('Interface Generation', () => {
    it('should generate proper interface with required and optional properties', () => {
      const properties = {
        id: { type: 'number', description: 'Unique identifier' },
        name: { type: 'string', description: 'User name' },
        email: { type: 'string', description: 'Email address' }
      };
      const required = ['id', 'name'];
      
      const result = typeMapper.generateInterface('User', properties, required);
      
      expect(result).toContain('export interface User {');
      expect(result).toContain('id: number;');
      expect(result).toContain('name: string;');
      expect(result).toContain('email?: string;');
      expect(result).toContain('/** Unique identifier */');
      expect(result).toContain('/** User name */');
      expect(result).toContain('/** Email address */');
    });

    it('should generate interface without documentation when disabled', () => {
      const typeMapperNoDoc = new TypeMapper({ includeDocumentation: false });
      const properties = {
        name: { type: 'string', description: 'User name' }
      };
      const required = ['name'];
      
      const result = typeMapperNoDoc.generateInterface('User', properties, required);
      
      expect(result).not.toContain('/**');
      expect(result).toContain('export interface User {');
      expect(result).toContain('name: string;');
    });
  });

  describe('Union Type Handling', () => {
    it('should handle union types correctly', () => {
      const schemas: JSONSchema[] = [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' }
      ];
      
      const result = typeMapper.handleUnionTypes(schemas);
      
      expect(result).toBe('string | number | boolean');
    });

    it('should handle complex union types', () => {
      const schemas: JSONSchema[] = [
        {
          type: 'object',
          properties: { type: { enum: ['success'] }, data: { type: 'string' } }
        },
        {
          type: 'object',
          properties: { type: { enum: ['error'] }, message: { type: 'string' } }
        }
      ];
      
      const result = typeMapper.handleUnionTypes(schemas);
      
      expect(result).toContain('|');
      expect(result).toContain("'success'");
      expect(result).toContain("'error'");
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty schema', () => {
      const schema: JSONSchema = {};
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('unknown');
    });

    it('should handle null schema', () => {
      const result = typeMapper.mapJsonSchemaToTypeScript(null as any);
      
      expect(result.typeString).toBe('unknown');
    });

    it('should handle schema with only description', () => {
      const schema: JSONSchema = { description: 'Some value' };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('unknown');
    });

    it('should sanitize interface names', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: { 
          value: { type: 'string' },
          count: { type: 'number' },
          active: { type: 'boolean' },
          extra: { type: 'string' }
        }
      };
      const result = typeMapper.mapJsonSchemaToTypeScript(schema, 'my-invalid-name!@#');
      
      expect(result.name).toMatch(/^[A-Z][a-zA-Z0-9_]*$/);
    });
  });

  describe('Configuration Options', () => {
    it('should use interface prefix when configured', () => {
      const typeMapperWithPrefix = new TypeMapper({ interfacePrefix: 'I' });
      const schema: JSONSchema = {
        type: 'object',
        properties: { 
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string' },
          active: { type: 'boolean' }
        }
      };
      
      const result = typeMapperWithPrefix.mapJsonSchemaToTypeScript(schema, 'User');
      
      expect(result.name).toBe('IUser');
    });

    it('should handle strict types option', () => {
      const typeMapperStrict = new TypeMapper({ strictTypes: true });
      const schema: JSONSchema = { type: 'string' };
      
      const result = typeMapperStrict.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toBe('string');
    });
  });

  describe('Complex Nested Schemas', () => {
    it('should handle deeply nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  settings: {
                    type: 'object',
                    properties: {
                      theme: { type: 'string' }
                    },
                    required: ['theme']
                  }
                },
                required: ['settings']
              }
            },
            required: ['profile']
          }
        },
        required: ['user']
      };
      
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toContain('theme: string');
    });

    it('should handle arrays of complex objects', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            tags: {
              type: 'array',
              items: { type: 'string' }
            },
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['id']
        }
      };
      
      const result = typeMapper.mapJsonSchemaToTypeScript(schema);
      
      expect(result.typeString).toContain('[]');
      expect(result.typeString).toContain('id: number');
      expect(result.typeString).toContain('tags?:');
      expect(result.typeString).toContain('string[]');
      expect(result.typeString).toContain('Record<string, string>');
    });
  });
});