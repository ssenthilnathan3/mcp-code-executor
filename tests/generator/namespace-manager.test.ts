/**
 * Tests for NamespaceManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NamespaceManager, type NamespaceManagerOptions } from '../../src/generator/namespace-manager.js';
import type { ToolSchema, NamespaceDefinition } from '../../src/types/index.js';

describe('NamespaceManager', () => {
  let namespaceManager: NamespaceManager;
  let defaultOptions: NamespaceManagerOptions;

  beforeEach(() => {
    defaultOptions = {
      conflictResolution: 'prefix',
      useServerNames: true,
    };
    namespaceManager = new NamespaceManager(defaultOptions);
  });

  describe('createNamespace', () => {
    it('should create a basic namespace for a server', () => {
      const tools: ToolSchema[] = [
        {
          name: 'getTodos',
          description: 'Get all todos',
          inputSchema: { type: 'object' },
          serverId: 'todo-server',
        },
        {
          name: 'createTodo',
          description: 'Create a new todo',
          inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
          serverId: 'todo-server',
        },
      ];

      const namespace = namespaceManager.createNamespace('todo-server', tools);

      expect(namespace.name).toBe('todo_server');
      expect(namespace.serverId).toBe('todo-server');
      expect(namespace.tools).toEqual(tools);
      expect(namespace.imports).toContain("import type { MCPBridge } from '../bridge/index.js';");
      expect(namespace.exports).toContain('export { todo_server };');
    });

    it('should apply namespace prefix when configured', () => {
      const options: NamespaceManagerOptions = {
        ...defaultOptions,
        namespacePrefix: 'mcp',
      };
      const manager = new NamespaceManager(options);

      const tools: ToolSchema[] = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: { type: 'object' },
          serverId: 'test-server',
        },
      ];

      const namespace = manager.createNamespace('test-server', tools);
      expect(namespace.name).toBe('mcp_test_server');
    });

    it('should use custom namespace mapping when provided', () => {
      const options: NamespaceManagerOptions = {
        ...defaultOptions,
        customNamespaces: {
          'complex-server-id': 'simpleApi',
        },
      };
      const manager = new NamespaceManager(options);

      const tools: ToolSchema[] = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: { type: 'object' },
          serverId: 'complex-server-id',
        },
      ];

      const namespace = manager.createNamespace('complex-server-id', tools);
      expect(namespace.name).toBe('simpleApi');
    });

    it('should sanitize server IDs for namespace names', () => {
      const tools: ToolSchema[] = [
        {
          name: 'test',
          description: 'Test tool',
          inputSchema: { type: 'object' },
          serverId: 'server@domain.com:8080',
        },
      ];

      const namespace = namespaceManager.createNamespace('server@domain.com:8080', tools);
      expect(namespace.name).toBe('server_domain_com_8080');
    });
  });

  describe('conflict resolution', () => {
    let namespaces: NamespaceDefinition[];

    beforeEach(() => {
      const tools1: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 1',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
        {
          name: 'uniqueTool1',
          description: 'Unique to server 1',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
      ];

      const tools2: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 2',
          inputSchema: { type: 'object' },
          serverId: 'server2',
        },
        {
          name: 'uniqueTool2',
          description: 'Unique to server 2',
          inputSchema: { type: 'object' },
          serverId: 'server2',
        },
      ];

      namespaces = [
        namespaceManager.createNamespace('server1', tools1),
        namespaceManager.createNamespace('server2', tools2),
      ];
    });

    it('should detect conflicts between namespaces', () => {
      const resolved = namespaceManager.resolveConflicts(namespaces);

      // Should have resolved the 'getData' conflict
      const server1Tools = resolved.find(ns => ns.serverId === 'server1')?.tools;
      const server2Tools = resolved.find(ns => ns.serverId === 'server2')?.tools;

      expect(server1Tools?.find(t => t.name === 'server1_getData')).toBeDefined();
      expect(server2Tools?.find(t => t.name === 'server2_getData')).toBeDefined();

      // Unique tools should remain unchanged
      expect(server1Tools?.find(t => t.name === 'uniqueTool1')).toBeDefined();
      expect(server2Tools?.find(t => t.name === 'uniqueTool2')).toBeDefined();
    });

    it('should use suffix resolution strategy', () => {
      const options: NamespaceManagerOptions = {
        ...defaultOptions,
        conflictResolution: 'suffix',
      };
      const manager = new NamespaceManager(options);

      // Create namespaces with the suffix manager
      const tools1: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 1',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
      ];

      const tools2: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 2',
          inputSchema: { type: 'object' },
          serverId: 'server2',
        },
      ];

      const suffixNamespaces = [
        manager.createNamespace('server1', tools1),
        manager.createNamespace('server2', tools2),
      ];

      const resolved = manager.resolveConflicts(suffixNamespaces);

      const server1Tools = resolved.find(ns => ns.serverId === 'server1')?.tools;
      const server2Tools = resolved.find(ns => ns.serverId === 'server2')?.tools;



      expect(server1Tools?.find(t => t.name === 'getData_server1')).toBeDefined();
      expect(server2Tools?.find(t => t.name === 'getData_server2')).toBeDefined();
    });

    it('should throw error when conflict resolution is set to error', () => {
      const options: NamespaceManagerOptions = {
        ...defaultOptions,
        conflictResolution: 'error',
      };
      const manager = new NamespaceManager(options);

      // Create namespaces with the error manager
      const tools1: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 1',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
      ];

      const tools2: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 2',
          inputSchema: { type: 'object' },
          serverId: 'server2',
        },
      ];

      const errorNamespaces = [
        manager.createNamespace('server1', tools1),
        manager.createNamespace('server2', tools2),
      ];

      expect(() => manager.resolveConflicts(errorNamespaces)).toThrow(
        'Tool name conflicts detected: getData'
      );
    });

    it('should handle multiple conflicts correctly', () => {
      const tools3: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server 3',
          inputSchema: { type: 'object' },
          serverId: 'server3',
        },
        {
          name: 'processData',
          description: 'Process data on server 3',
          inputSchema: { type: 'object' },
          serverId: 'server3',
        },
      ];

      // Add processData to server1 to create another conflict
      namespaces[0].tools.push({
        name: 'processData',
        description: 'Process data on server 1',
        inputSchema: { type: 'object' },
        serverId: 'server1',
      });

      namespaces.push(namespaceManager.createNamespace('server3', tools3));

      const resolved = namespaceManager.resolveConflicts(namespaces);

      // Check getData conflicts (3-way)
      expect(resolved.find(ns => ns.serverId === 'server1')?.tools.find(t => t.name === 'server1_getData')).toBeDefined();
      expect(resolved.find(ns => ns.serverId === 'server2')?.tools.find(t => t.name === 'server2_getData')).toBeDefined();
      expect(resolved.find(ns => ns.serverId === 'server3')?.tools.find(t => t.name === 'server3_getData')).toBeDefined();

      // Check processData conflicts (2-way)
      expect(resolved.find(ns => ns.serverId === 'server1')?.tools.find(t => t.name === 'server1_processData')).toBeDefined();
      expect(resolved.find(ns => ns.serverId === 'server3')?.tools.find(t => t.name === 'server3_processData')).toBeDefined();
    });

    it('should return unchanged namespaces when no conflicts exist', () => {
      const noConflictTools1: ToolSchema[] = [
        {
          name: 'uniqueTool1',
          description: 'Unique to server 1',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
      ];

      const noConflictTools2: ToolSchema[] = [
        {
          name: 'uniqueTool2',
          description: 'Unique to server 2',
          inputSchema: { type: 'object' },
          serverId: 'server2',
        },
      ];

      const noConflictNamespaces = [
        namespaceManager.createNamespace('server1', noConflictTools1),
        namespaceManager.createNamespace('server2', noConflictTools2),
      ];

      const resolved = namespaceManager.resolveConflicts(noConflictNamespaces);

      expect(resolved).toEqual(noConflictNamespaces);
    });
  });

  describe('generateImports', () => {
    it('should generate basic imports for simple tools', () => {
      const tools: ToolSchema[] = [
        {
          name: 'simpleTool',
          description: 'A simple tool',
          inputSchema: { type: 'string' },
          serverId: 'test-server',
        },
      ];

      const imports = namespaceManager.generateImports('testNamespace', tools);

      expect(imports).toContain("import type { MCPBridge } from '../bridge/index.js';");
    });

    it('should generate type imports for complex schemas', () => {
      const tools: ToolSchema[] = [
        {
          name: 'complexTool',
          description: 'A complex tool',
          inputSchema: {
            type: 'object',
            properties: {
              data: { type: 'object' },
            },
          },
          serverId: 'test-server',
        },
      ];

      const imports = namespaceManager.generateImports('testNamespace', tools);

      expect(imports).toContain("import type { MCPBridge } from '../bridge/index.js';");
      expect(imports).toContain("import type { JSONSchema } from '../types/index.js';");
    });

    it('should work with NamespaceDefinition parameter', () => {
      const namespace: NamespaceDefinition = {
        name: 'testNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'test',
            description: 'Test tool',
            inputSchema: { type: 'string' },
            serverId: 'test-server',
          },
        ],
        imports: [],
        exports: [],
      };

      const imports = namespaceManager.generateImports(namespace);
      expect(imports).toContain("import type { MCPBridge } from '../bridge/index.js';");
    });
  });

  describe('generateExports', () => {
    it('should generate exports for namespace and tools', () => {
      const tools: ToolSchema[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' },
          serverId: 'test-server',
        },
        {
          name: 'tool-2',
          description: 'Tool 2',
          inputSchema: { type: 'object' },
          serverId: 'test-server',
        },
      ];

      const exports = namespaceManager.generateExports('testNamespace', tools);

      expect(exports).toContain('export { testNamespace }');
      expect(exports).toContain('export { tool1, tool_2 }');
    });

    it('should work with NamespaceDefinition parameter', () => {
      const namespace: NamespaceDefinition = {
        name: 'testNamespace',
        serverId: 'test-server',
        tools: [
          {
            name: 'test',
            description: 'Test tool',
            inputSchema: { type: 'string' },
            serverId: 'test-server',
          },
        ],
        imports: [],
        exports: [],
      };

      const exports = namespaceManager.generateExports(namespace);
      expect(exports).toContain('export { testNamespace }');
      expect(exports).toContain('export { test }');
    });
  });

  describe('name sanitization', () => {
    it('should sanitize server IDs with special characters', () => {
      const testCases = [
        { input: 'server@domain.com', expected: 'server_domain_com' },
        { input: 'server-with-dashes', expected: 'server_with_dashes' },
        { input: '123numeric-start', expected: '_123numeric_start' },
        { input: 'server__double__underscore', expected: 'server_double_underscore' },
        { input: '_leading_trailing_', expected: 'leading_trailing' },
        { input: 'normal_server', expected: 'normal_server' },
      ];

      for (const testCase of testCases) {
        const tools: ToolSchema[] = [
          {
            name: 'test',
            description: 'Test tool',
            inputSchema: { type: 'object' },
            serverId: testCase.input,
          },
        ];

        const namespace = namespaceManager.createNamespace(testCase.input, tools);
        expect(namespace.name).toBe(testCase.expected);
      }
    });

    it('should sanitize tool names with special characters', () => {
      const tools: ToolSchema[] = [
        {
          name: 'tool-with-dashes',
          description: 'Tool with dashes',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
        {
          name: 'tool@special.chars',
          description: 'Tool with special chars',
          inputSchema: { type: 'object' },
          serverId: 'server1',
        },
      ];

      const namespace = namespaceManager.createNamespace('server1', tools);
      const exports = namespaceManager.generateExports(namespace);

      expect(exports).toContain('tool_with_dashes');
      expect(exports).toContain('tool_special_chars');
    });
  });

  describe('edge cases', () => {
    it('should handle empty tool arrays', () => {
      const namespace = namespaceManager.createNamespace('empty-server', []);

      expect(namespace.name).toBe('empty_server');
      expect(namespace.tools).toEqual([]);
      expect(namespace.imports).toContain("import type { MCPBridge } from '../bridge/index.js';");
      expect(namespace.exports).toContain('export { empty_server };');
    });

    it('should handle single namespace without conflicts', () => {
      const tools: ToolSchema[] = [
        {
          name: 'singleTool',
          description: 'Single tool',
          inputSchema: { type: 'object' },
          serverId: 'single-server',
        },
      ];

      const namespace = namespaceManager.createNamespace('single-server', tools);
      const resolved = namespaceManager.resolveConflicts([namespace]);

      expect(resolved).toEqual([namespace]);
    });

    it('should handle complex schema detection correctly', () => {
      const complexTools: ToolSchema[] = [
        {
          name: 'arrayTool',
          description: 'Tool with array schema',
          inputSchema: {
            type: 'array',
            items: { type: 'string' },
          },
          serverId: 'test-server',
        },
        {
          name: 'unionTool',
          description: 'Tool with union schema',
          inputSchema: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
          serverId: 'test-server',
        },
      ];

      const imports = namespaceManager.generateImports('testNamespace', complexTools);
      expect(imports).toContain("import type { JSONSchema }");
    });
  });
});