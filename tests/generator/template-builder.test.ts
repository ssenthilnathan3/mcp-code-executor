/**
 * Unit tests for TemplateBuilder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateBuilder } from '../../src/generator/template-builder.js';
import type { ToolSchema, NamespaceDefinition, JSONSchema } from '../../src/types/index.js';

describe('TemplateBuilder', () => {
  let builder: TemplateBuilder;

  beforeEach(() => {
    builder = new TemplateBuilder({
      includeDocumentation: true,
      indent: '  ',
      strictTypes: true,
    });
  });

  describe('generateNamespaceFile', () => {
    it('should generate a complete namespace file', () => {
      // Arrange
      const namespace: NamespaceDefinition = {
        name: 'TestNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'simpleFunction',
            description: 'A simple test function',
            serverId: 'test-server',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'The message to process',
                },
              },
              required: ['message'],
            },
            outputSchema: {
              type: 'object',
              properties: {
                result: {
                  type: 'string',
                  description: 'The processed result',
                },
              },
              required: ['result'],
            },
          },
        ],
        imports: [],
        exports: [],
      };

      // Act
      const result = builder.generateNamespaceFile(namespace);

      // Assert
      expect(result).toContain('/**');
      expect(result).toContain('Generated namespace: TestNamespace');
      expect(result).toContain('Server ID: test-server');
      expect(result).toContain("import type { MCPBridge } from '../bridge/index.js';");
      expect(result).toContain('export interface Simplefunctioninput');
      expect(result).toContain('export interface Simplefunctionoutput');
      expect(result).toContain('export const TestNamespace = {');
      expect(result).toContain('async simpleFunction(');
      expect(result).toContain('A simple test function');
      expect(result).toContain("bridge.callTool('test-server', 'simpleFunction', args)");
      expect(result).toContain('export default TestNamespace;');
    });

    it('should handle tools without output schemas', () => {
      // Arrange
      const namespace: NamespaceDefinition = {
        name: 'TestNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'voidFunction',
            description: 'A function with no return value',
            serverId: 'test-server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
        imports: [],
        exports: [],
      };

      // Act
      const result = builder.generateNamespaceFile(namespace);

      // Assert
      expect(result).toContain('Promise<unknown>');
      expect(result).not.toContain('VoidFunctionOutput');
    });

    it('should generate without documentation when disabled', () => {
      // Arrange
      const builderWithoutDocs = new TemplateBuilder({
        includeDocumentation: false,
      });

      const namespace: NamespaceDefinition = {
        name: 'TestNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'testFunction',
            description: 'Test description',
            serverId: 'test-server',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        imports: [],
        exports: [],
      };

      // Act
      const result = builderWithoutDocs.generateNamespaceFile(namespace);

      // Assert
      expect(result).not.toContain('/**');
      expect(result).not.toContain('Test description');
      expect(result).not.toContain('Generated namespace');
    });
  });

  describe('generateToolFunction', () => {
    it('should generate a complete tool function', () => {
      // Arrange
      const tool: ToolSchema = {
        name: 'calculateSum',
        description: 'Calculates the sum of two numbers',
        serverId: 'math-server',
        inputSchema: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            sum: {
              type: 'number',
              description: 'The calculated sum',
            },
          },
          required: ['sum'],
        },
      };

      // Act
      const result = builder.generateToolFunction(tool, 'MathNamespace');

      // Assert
      expect(result).toContain('/**');
      expect(result).toContain('Calculates the sum of two numbers');
      expect(result).toContain('@param a {number} First number');
      expect(result).toContain('@param b {number} Second number');
      expect(result).toContain('@returns {Promise<CalculatesumOutput>}');
      expect(result).toContain('async calculateSum(args: CalculatesumInput, bridge: MCPBridge): Promise<CalculatesumOutput>');
      expect(result).toContain("bridge.callTool('math-server', 'calculateSum', args)");
    });

    it('should handle optional parameters correctly', () => {
      // Arrange
      const tool: ToolSchema = {
        name: 'greetUser',
        description: 'Greets a user with optional title',
        serverId: 'greeting-server',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User name',
            },
            title: {
              type: 'string',
              description: 'Optional title',
            },
          },
          required: ['name'],
        },
      };

      // Act
      const result = builder.generateToolFunction(tool, 'GreetingNamespace');

      // Assert
      expect(result).toContain('@param name {string} User name');
      expect(result).toContain('@param title? {string} Optional title');
    });
  });

  describe('generateInterface', () => {
    it('should generate a proper TypeScript interface', () => {
      // Arrange
      const schema: JSONSchema = {
        type: 'object',
        description: 'User information',
        properties: {
          id: {
            type: 'number',
            description: 'User ID',
          },
          name: {
            type: 'string',
            description: 'User name',
          },
          email: {
            type: 'string',
            description: 'User email',
          },
          active: {
            type: 'boolean',
            description: 'Whether user is active',
          },
        },
        required: ['id', 'name'],
      };

      // Act
      const result = builder.generateInterface('UserInfo', schema);

      // Assert
      expect(result).toContain('/**');
      expect(result).toContain('User information');
      expect(result).toContain('export interface Userinfo {');
      expect(result).toContain('/** User ID */');
      expect(result).toContain('id: number;');
      expect(result).toContain('/** User name */');
      expect(result).toContain('name: string;');
      expect(result).toContain('/** User email */');
      expect(result).toContain('email?: string;');
      expect(result).toContain('/** Whether user is active */');
      expect(result).toContain('active?: boolean;');
      expect(result).toContain('}');
    });

    it('should handle arrays and complex types', () => {
      // Arrange
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of tags',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
          },
          scores: {
            type: 'array',
            items: { type: 'number' },
            description: 'Numeric scores',
          },
        },
        required: ['tags'],
      };

      // Act
      const result = builder.generateInterface('ComplexData', schema);

      // Assert
      expect(result).toContain('tags: string[];');
      expect(result).toContain('metadata?: Record<string, unknown>;');
      expect(result).toContain('scores?: number[];');
    });
  });

  describe('generateToolJSDoc', () => {
    it('should generate comprehensive JSDoc comments', () => {
      // Arrange
      const tool: ToolSchema = {
        name: 'processData',
        description: 'Processes input data and returns results',
        serverId: 'data-server',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'string',
              description: 'Input data to process',
            },
            options: {
              type: 'object',
              description: 'Processing options',
            },
          },
          required: ['data'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            processed: {
              type: 'string',
              description: 'Processed data',
            },
          },
          description: 'Processing result',
        },
      };

      const context = {
        indentLevel: 1,
        imports: new Set<string>(),
        typeDefinitions: new Map<string, string>(),
      };

      // Act
      const result = builder.generateToolJSDoc(tool, context);

      // Assert
      expect(result).toContain('  /**');
      expect(result).toContain('  * Processes input data and returns results');
      expect(result).toContain('  * @param data {string} Input data to process');
      expect(result).toContain('  * @param options? {Record<string, unknown>} Processing options');
      expect(result).toContain('  * @returns {Promise<ProcessdataOutput>} Processing result');
      expect(result).toContain('  */');
    });
  });

  describe('Name Sanitization', () => {
    it('should sanitize tool names correctly', () => {
      // Arrange
      const namespace: NamespaceDefinition = {
        name: 'TestNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'get-user-data',
            description: 'Gets user data',
            serverId: 'test-server',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: '123invalidName',
            description: 'Invalid name starting with number',
            serverId: 'test-server',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'special@chars!',
            description: 'Name with special characters',
            serverId: 'test-server',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        imports: [],
        exports: [],
      };

      // Act
      const result = builder.generateNamespaceFile(namespace);

      // Assert
      expect(result).toContain('async get_user_data(');
      expect(result).toContain('async _123invalidName(');
      expect(result).toContain('async special_chars_(');
    });

    it('should sanitize interface names correctly', () => {
      // Arrange
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };

      // Act
      const result = builder.generateInterface('invalid-name@123', schema);

      // Assert
      expect(result).toContain('export interface InvalidName123 {');
    });
  });

  describe('Custom Options', () => {
    it('should respect custom indentation', () => {
      // Arrange
      const customBuilder = new TemplateBuilder({
        indent: '    ', // 4 spaces
        includeDocumentation: false,
      });

      const namespace: NamespaceDefinition = {
        name: 'TestNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'testTool',
            description: 'Test tool',
            serverId: 'test-server',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        imports: [],
        exports: [],
      };

      // Act
      const result = customBuilder.generateNamespaceFile(namespace);

      // Assert
      // Check that functions are indented with 4 spaces
      expect(result).toContain('    async testTool(');
    });

    it('should use custom interface prefix', () => {
      // Arrange
      const customBuilder = new TemplateBuilder({
        interfacePrefix: 'Custom',
      });

      const tool: ToolSchema = {
        name: 'testTool',
        description: 'Test tool',
        serverId: 'test-server',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
        },
      };

      // Act
      const result = customBuilder.generateToolFunction(tool, 'TestNamespace');

      // Assert
      expect(result).toContain('CustomTesttoolInput');
    });
  });
});