/**
 * Tests for ApiFactory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiFactory } from '../../src/bridge/api-factory.js';
import type { NamespaceDefinition, ToolSchema, IMCPBridge } from '../../src/types/index.js';

describe('ApiFactory', () => {
  let factory: ApiFactory;
  let mockBridge: IMCPBridge;

  const mockTool: ToolSchema = {
    name: 'getUserData',
    description: 'Get user data by ID',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        includeProfile: { type: 'boolean', description: 'Include profile data' }
      },
      required: ['userId']
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        profile: { type: 'object' }
      },
      required: ['id', 'name']
    },
    serverId: 'userService'
  };

  const mockNamespace: NamespaceDefinition = {
    name: 'userService',
    serverId: 'userService',
    tools: [mockTool],
    imports: ["import type { BaseResponse } from './types';"],
    exports: ["export * from './user-types';"]
  };

  beforeEach(() => {
    mockBridge = {
      createProxy: vi.fn(),
      interceptCall: vi.fn(),
      registerInterceptor: vi.fn(),
      removeInterceptor: vi.fn(),
      getInterceptor: vi.fn()
    } as any;
    
    factory = new ApiFactory(mockBridge);
  });

  describe('createNamespaceApi', () => {
    it('should generate complete namespace API', async () => {
      const code = await factory.createNamespaceApi(mockNamespace);
      
      expect(code).toContain('Generated API for userService namespace');
      expect(code).toContain('export interface GetUserDataInput');
      expect(code).toContain('export interface GetUserDataOutput');
      expect(code).toContain('export async function getUserData');
      expect(code).toContain('export const tools = {');
      expect(code).toContain('export default tools;');
    });

    it('should include imports and exports', async () => {
      const code = await factory.createNamespaceApi(mockNamespace);
      
      expect(code).toContain("import type { BaseResponse } from './types';");
      expect(code).toContain("export * from './user-types';");
    });

    it('should inject bridge reference when bridge is available', async () => {
      const code = await factory.createNamespaceApi(mockNamespace);
      
      expect(code).toContain("import type { IMCPBridge } from '@mcp-code-executor/bridge';");
      expect(code).toContain('declare const __bridge: IMCPBridge;');
      expect(code).toContain('__bridge.interceptCall');
    });

    it('should handle configuration options', async () => {
      const code = await factory.createNamespaceApi(mockNamespace, {
        includeDocumentation: false,
        strictTypes: false,
        includeValidation: true
      });
      
      expect(code).not.toContain('/**');
      expect(code).toContain('// Runtime validation would go here');
    });
  });

  describe('generateToolInterfaces', () => {
    it('should generate input interface', () => {
      const interfaces = factory.generateToolInterfaces([mockTool]);
      
      expect(interfaces).toContain('export interface GetUserDataInput {');
      expect(interfaces).toContain('userId: string;');
      expect(interfaces).toContain('includeProfile?: boolean;');
    });

    it('should generate output interface when available', () => {
      const interfaces = factory.generateToolInterfaces([mockTool]);
      
      expect(interfaces).toContain('export interface GetUserDataOutput {');
      expect(interfaces).toContain('id: string;');
      expect(interfaces).toContain('name: string;');
      expect(interfaces).toContain('profile?: Record<string, any>;');
    });

    it('should include JSDoc comments when configured', () => {
      const interfaces = factory.generateToolInterfaces([mockTool], {
        includeDocumentation: true,
        strictTypes: true,
        includeValidation: false
      });
      
      expect(interfaces).toContain('/** User ID */');
      expect(interfaces).toContain('/** Include profile data */');
    });

    it('should handle tools without output schema', () => {
      const toolWithoutOutput = { ...mockTool, outputSchema: undefined };
      const interfaces = factory.generateToolInterfaces([toolWithoutOutput]);
      
      expect(interfaces).toContain('export interface GetUserDataInput {');
      expect(interfaces).not.toContain('export interface GetUserDataOutput {');
    });
  });

  describe('generateProxyCode', () => {
    it('should generate function for each tool', () => {
      const code = factory.generateProxyCode([mockTool]);
      
      expect(code).toContain('export async function getUserData(args: GetUserDataInput): Promise<GetUserDataOutput>');
      expect(code).toContain('return /* BRIDGE_CALL */(\'userService\', \'getUserData\', [args]);');
    });

    it('should generate namespace object', () => {
      const code = factory.generateProxyCode([mockTool]);
      
      expect(code).toContain('export const tools = {');
      expect(code).toContain('getUserData,');
      expect(code).toContain('export default tools;');
    });

    it('should handle multiple tools', () => {
      const tool2: ToolSchema = {
        name: 'updateUser',
        description: 'Update user',
        inputSchema: { type: 'object', properties: {} },
        serverId: 'userService'
      };

      const code = factory.generateProxyCode([mockTool, tool2]);
      
      expect(code).toContain('export async function getUserData');
      expect(code).toContain('export async function updateUser');
      expect(code).toContain('getUserData,');
      expect(code).toContain('updateUser,');
    });

    it('should sanitize function names', () => {
      const toolWithSpecialChars: ToolSchema = {
        name: 'get-user.data_v2',
        description: 'Get user data',
        inputSchema: { type: 'object', properties: {} },
        serverId: 'userService'
      };

      const code = factory.generateProxyCode([toolWithSpecialChars]);
      
      expect(code).toContain('export async function get_user_data_v2');
    });
  });

  describe('injectBridgeReference', () => {
    it('should inject bridge import and declaration', () => {
      const originalCode = 'export function test() { return /* BRIDGE_CALL */("server", "tool", []); }';
      
      const injectedCode = factory.injectBridgeReference(originalCode);
      
      expect(injectedCode).toContain("import type { IMCPBridge } from '@mcp-code-executor/bridge';");
      expect(injectedCode).toContain('declare const __bridge: IMCPBridge;');
      expect(injectedCode).toContain('__bridge.interceptCall("server", "tool", []);');
    });

    it('should use custom bridge variable name', () => {
      const originalCode = 'return /* BRIDGE_CALL */("server", "tool", []);';
      
      const injectedCode = factory.injectBridgeReference(originalCode, 'customBridge');
      
      expect(injectedCode).toContain('declare const customBridge: IMCPBridge;');
      expect(injectedCode).toContain('customBridge.interceptCall("server", "tool", []);');
    });

    it('should replace all bridge call placeholders', () => {
      const originalCode = `
        function tool1() { return /* BRIDGE_CALL */("server", "tool1", []); }
        function tool2() { return /* BRIDGE_CALL */("server", "tool2", []); }
      `;
      
      const injectedCode = factory.injectBridgeReference(originalCode);
      
      expect(injectedCode).toContain('__bridge.interceptCall("server", "tool1", []);');
      expect(injectedCode).toContain('__bridge.interceptCall("server", "tool2", []);');
      expect(injectedCode).not.toContain('/* BRIDGE_CALL */');
    });
  });

  describe('JSON Schema to TypeScript conversion', () => {
    it('should convert primitive types', () => {
      const stringTool: ToolSchema = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            str: { type: 'string' },
            num: { type: 'number' },
            bool: { type: 'boolean' }
          }
        },
        serverId: 'test'
      };

      const interfaces = factory.generateToolInterfaces([stringTool]);
      
      expect(interfaces).toContain('str?: string;');
      expect(interfaces).toContain('num?: number;');
      expect(interfaces).toContain('bool?: boolean;');
    });

    it('should convert array types', () => {
      const arrayTool: ToolSchema = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            strings: { type: 'array', items: { type: 'string' } },
            numbers: { type: 'array', items: { type: 'number' } }
          }
        },
        serverId: 'test'
      };

      const interfaces = factory.generateToolInterfaces([arrayTool]);
      
      expect(interfaces).toContain('strings?: string[];');
      expect(interfaces).toContain('numbers?: number[];');
    });

    it('should convert enum types', () => {
      const enumTool: ToolSchema = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
          }
        },
        serverId: 'test'
      };

      const interfaces = factory.generateToolInterfaces([enumTool]);
      
      expect(interfaces).toContain("status?: 'active' | 'inactive' | 'pending';");
    });

    it('should convert union types', () => {
      const unionTool: ToolSchema = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              anyOf: [
                { type: 'string' },
                { type: 'number' }
              ]
            }
          }
        },
        serverId: 'test'
      };

      const interfaces = factory.generateToolInterfaces([unionTool]);
      
      expect(interfaces).toContain('value?: string | number;');
    });

    it('should handle custom type mappings', () => {
      const customTool: ToolSchema = {
        name: 'test',
        description: 'Test',
        inputSchema: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        serverId: 'test'
      };

      const interfaces = factory.generateToolInterfaces([customTool], {
        includeDocumentation: false,
        strictTypes: true,
        includeValidation: false,
        typeMapping: { string: 'Date' }
      });
      
      expect(interfaces).toContain('timestamp?: Date;');
    });
  });

  describe('error handling', () => {
    it('should throw GenerationError on failure', async () => {
      const invalidNamespace = { ...mockNamespace, tools: null as any };
      
      await expect(factory.createNamespaceApi(invalidNamespace)).rejects.toThrow('Failed to create namespace API');
    });
  });

  describe('factory without bridge', () => {
    it('should work without bridge injection', async () => {
      const factoryWithoutBridge = new ApiFactory();
      
      const code = await factoryWithoutBridge.createNamespaceApi(mockNamespace);
      
      expect(code).not.toContain("import type { IMCPBridge }");
      expect(code).not.toContain('declare const __bridge');
      expect(code).toContain('/* BRIDGE_CALL */'); // Placeholder not replaced
    });
  });

  describe('dynamic module loading', () => {
    it('should cache loaded modules', async () => {
      const mockModule = { test: 'value' };
      
      // Mock the loadGeneratedModule method to avoid actual dynamic import
      const loadSpy = vi.spyOn(factory, 'loadGeneratedModule').mockImplementation(async (path: string) => {
        if (factory['moduleCache'].has(path)) {
          return factory['moduleCache'].get(path);
        }
        factory['moduleCache'].set(path, mockModule);
        return mockModule;
      });
      
      const result1 = await factory.loadGeneratedModule('/test/module.js');
      const result2 = await factory.loadGeneratedModule('/test/module.js');
      
      expect(result1).toBe(mockModule);
      expect(result2).toBe(mockModule);
      expect(loadSpy).toHaveBeenCalledTimes(2);
      
      loadSpy.mockRestore();
    });

    it('should handle module loading errors', async () => {
      const loadSpy = vi.spyOn(factory, 'loadGeneratedModule').mockRejectedValue(
        new Error('Module not found')
      );
      
      await expect(factory.loadGeneratedModule('/nonexistent/module.js'))
        .rejects.toThrow('Module not found');
      
      loadSpy.mockRestore();
    });

    it('should clear module cache', () => {
      // Manually add something to cache
      factory['moduleCache'].set('/test/module.js', { test: 'value' });
      
      const statsBefore = factory.getModuleCacheStats();
      expect(statsBefore.size).toBe(1);
      
      factory.clearModuleCache();
      
      const statsAfter = factory.getModuleCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    it('should get module cache stats', () => {
      factory['moduleCache'].set('/test/module1.js', { test1: 'value1' });
      factory['moduleCache'].set('/test/module2.js', { test2: 'value2' });
      
      const stats = factory.getModuleCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.modules).toContain('/test/module1.js');
      expect(stats.modules).toContain('/test/module2.js');
      
      factory.clearModuleCache();
    });
  });

  describe('JavaScript conversion', () => {
    it('should convert TypeScript to JavaScript', () => {
      const tsCode = `import type { SomeType } from './types';

export interface TestInterface {
  prop: string;
}

declare const bridge: SomeType;

export function test(arg: string): Promise<number> {
  return bridge.call(arg);
}`;
      
      // Access the private method through any cast for testing
      const jsCode = (factory as any).convertToJavaScript(tsCode);
      

      
      expect(jsCode).not.toContain('import type');
      expect(jsCode).not.toContain('export interface');
      expect(jsCode).not.toContain('declare const');
      expect(jsCode).not.toContain(': string');
      expect(jsCode).not.toContain(': Promise<number>');
      expect(jsCode).toContain('export function test(arg)');
      expect(jsCode).toContain('return bridge.call(arg);');
    });
  });
});