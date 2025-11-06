/**
 * Integration tests for TypeScript generation pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TypeScriptGenerator } from '../../src/generator/typescript-generator.js';
import type { 
  GenerationConfig, 
  MCPServerInfo, 
  ToolSchema, 
  JSONSchema 
} from '../../src/types/index.js';

describe('TypeScriptGenerator Integration Tests', () => {
  let tempDir: string;
  let generator: TypeScriptGenerator;
  let config: GenerationConfig;

  beforeEach(async () => {
    // Create temporary directory for test output
    tempDir = join(tmpdir(), `mcp-generator-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    config = {
      outputDir: tempDir,
      includeDocumentation: true,
      typeScriptVersion: '5.0',
      strictTypes: true,
      namespacePrefix: 'MCP',
    };

    generator = new TypeScriptGenerator({
      config,
      namespaceManager: {
        conflictResolution: 'prefix',
        useServerNames: true,
      },
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Generation Pipeline', () => {
    it('should generate complete TypeScript APIs for multiple servers', async () => {
      // Arrange
      const servers: MCPServerInfo[] = [
        {
          id: 'weather-server',
          url: 'http://localhost:3001',
          connected: true,
          name: 'Weather Service',
        },
        {
          id: 'file-server',
          url: 'http://localhost:3002',
          connected: true,
          name: 'File Operations',
        },
      ];

      const weatherTools: ToolSchema[] = [
        {
          name: 'getCurrentWeather',
          description: 'Get current weather for a location',
          serverId: 'weather-server',
          inputSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The location to get weather for',
              },
              units: {
                type: 'string',
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature units',
              },
            },
            required: ['location'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              temperature: {
                type: 'number',
                description: 'Current temperature',
              },
              condition: {
                type: 'string',
                description: 'Weather condition',
              },
              humidity: {
                type: 'number',
                description: 'Humidity percentage',
              },
            },
            required: ['temperature', 'condition'],
          },
        },
      ];

      const fileTools: ToolSchema[] = [
        {
          name: 'readFile',
          description: 'Read contents of a file',
          serverId: 'file-server',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to read',
              },
              encoding: {
                type: 'string',
                description: 'File encoding',
                default: 'utf-8',
              },
            },
            required: ['path'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'File contents',
              },
              size: {
                type: 'number',
                description: 'File size in bytes',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'writeFile',
          description: 'Write content to a file',
          serverId: 'file-server',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to write',
              },
              content: {
                type: 'string',
                description: 'Content to write',
              },
              overwrite: {
                type: 'boolean',
                description: 'Whether to overwrite existing file',
                default: false,
              },
            },
            required: ['path', 'content'],
          },
        },
      ];

      const toolsByServer = new Map([
        ['weather-server', weatherTools],
        ['file-server', fileTools],
      ]);

      // Act
      const result = await generator.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);
      expect(result.generatedFiles).toHaveLength(3); // 2 namespace files + 1 index file
      expect(result.warnings).toEqual([]);

      // Verify files were created
      const files = await fs.readdir(tempDir);
      expect(files).toContain('MCP_weather_server.ts');
      expect(files).toContain('MCP_file_server.ts');
      expect(files).toContain('index.ts');

      // Verify weather server file content
      const weatherContent = await fs.readFile(
        join(tempDir, 'MCP_weather_server.ts'),
        'utf-8'
      );
      expect(weatherContent).toContain('export interface Getcurrentweatherinput');
      expect(weatherContent).toContain('export interface Getcurrentweatheroutput');
      expect(weatherContent).toContain('async getCurrentWeather(');
      expect(weatherContent).toContain('Get current weather for a location');
      expect(weatherContent).toContain("bridge.callTool('weather-server', 'getCurrentWeather', args)");

      // Verify file server file content
      const fileContent = await fs.readFile(
        join(tempDir, 'MCP_file_server.ts'),
        'utf-8'
      );
      expect(fileContent).toContain('async readFile(');
      expect(fileContent).toContain('async writeFile(');
      expect(fileContent).toContain('Read contents of a file');
      expect(fileContent).toContain('Write content to a file');

      // Verify index file content
      const indexContent = await fs.readFile(join(tempDir, 'index.ts'), 'utf-8');
      expect(indexContent).toContain('export { default as MCP_weather_server }');
      expect(indexContent).toContain('export { default as MCP_file_server }');
      expect(indexContent).toContain('export const MCP = {');
      expect(indexContent).toContain('MCP_weather_server,');
      expect(indexContent).toContain('MCP_file_server,');
    });

    it('should handle servers with no tools gracefully', async () => {
      // Arrange
      const servers: MCPServerInfo[] = [
        {
          id: 'empty-server',
          url: 'http://localhost:3003',
          connected: true,
        },
        {
          id: 'working-server',
          url: 'http://localhost:3004',
          connected: true,
        },
      ];

      const toolsByServer = new Map([
        ['empty-server', []],
        ['working-server', [
          {
            name: 'testTool',
            description: 'A test tool',
            serverId: 'working-server',
            inputSchema: { type: 'object', properties: {} },
          },
        ]],
      ]);

      // Act
      const result = await generator.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Server empty-server has no tools, skipping namespace generation');
      expect(result.generatedFiles).toHaveLength(2); // 1 namespace file + 1 index file

      const files = await fs.readdir(tempDir);
      expect(files).not.toContain('MCP_empty_server.ts');
      expect(files).toContain('MCP_working_server.ts');
    });

    it('should handle complex nested schemas correctly', async () => {
      // Arrange
      const servers: MCPServerInfo[] = [
        {
          id: 'complex-server',
          url: 'http://localhost:3005',
          connected: true,
        },
      ];

      const complexSchema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              preferences: {
                type: 'object',
                properties: {
                  theme: { type: 'string', enum: ['light', 'dark'] },
                  notifications: { type: 'boolean' },
                },
                required: ['theme'],
              },
            },
            required: ['id', 'name'],
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          metadata: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['user'],
      };

      const tools: ToolSchema[] = [
        {
          name: 'processComplexData',
          description: 'Process complex nested data structure',
          serverId: 'complex-server',
          inputSchema: complexSchema,
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              processedCount: { type: 'number' },
            },
            required: ['success'],
          },
        },
      ];

      const toolsByServer = new Map([['complex-server', tools]]);

      // Act
      const result = await generator.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);

      const content = await fs.readFile(
        join(tempDir, 'MCP_complex_server.ts'),
        'utf-8'
      );

      // Verify complex type generation
      expect(content).toContain('export interface Processcomplexdatainput');
      expect(content).toContain('export interface Processcomplexdataoutput');
      expect(content).toContain('user: object');
      expect(content).toContain('tags?: string[]');
      expect(content).toContain('metadata?: Record<string, unknown>');
    });

    it('should resolve naming conflicts correctly', async () => {
      // Arrange
      const servers: MCPServerInfo[] = [
        { id: 'server-a', url: 'http://localhost:3006', connected: true },
        { id: 'server-b', url: 'http://localhost:3007', connected: true },
      ];

      const conflictingTools: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server A',
          serverId: 'server-a',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const conflictingToolsB: ToolSchema[] = [
        {
          name: 'getData',
          description: 'Get data from server B',
          serverId: 'server-b',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const toolsByServer = new Map([
        ['server-a', conflictingTools],
        ['server-b', conflictingToolsB],
      ]);

      // Act
      const result = await generator.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);

      const contentA = await fs.readFile(
        join(tempDir, 'MCP_server_a.ts'),
        'utf-8'
      );
      const contentB = await fs.readFile(
        join(tempDir, 'MCP_server_b.ts'),
        'utf-8'
      );

      // Verify that conflicts were resolved (exact resolution depends on implementation)
      expect(contentA).toContain('getData');
      expect(contentB).toContain('getData');
    });
  });

  describe('Single Server Generation', () => {
    it('should generate TypeScript for a single server', async () => {
      // Arrange
      const server: MCPServerInfo = {
        id: 'test-server',
        url: 'http://localhost:3008',
        connected: true,
      };

      const tools: ToolSchema[] = [
        {
          name: 'simpleFunction',
          description: 'A simple test function',
          serverId: 'test-server',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
        },
      ];

      // Act
      const content = await generator.generateForServer(server, tools);

      // Assert
      expect(content).toContain('export const MCP_test_server = {');
      expect(content).toContain('async simpleFunction(');
      expect(content).toContain('A simple test function');
      expect(content).toContain("bridge.callTool('test-server', 'simpleFunction', args)");
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid output directory gracefully', async () => {
      // Arrange
      const invalidConfig = {
        ...config,
        outputDir: '/invalid/path/that/does/not/exist',
      };

      const invalidGenerator = new TypeScriptGenerator({
        config: invalidConfig,
      });

      const servers: MCPServerInfo[] = [
        { id: 'test', url: 'http://localhost', connected: true },
      ];
      const toolsByServer = new Map([['test', []]]);

      // Act
      const result = await invalidGenerator.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Failed to create directory');
    });
  });

  describe('Configuration Options', () => {
    it('should respect includeDocumentation setting', async () => {
      // Arrange
      const configWithoutDocs = {
        ...config,
        includeDocumentation: false,
      };

      const generatorWithoutDocs = new TypeScriptGenerator({
        config: configWithoutDocs,
      });

      const servers: MCPServerInfo[] = [
        { id: 'test', url: 'http://localhost', connected: true },
      ];

      const tools: ToolSchema[] = [
        {
          name: 'testTool',
          description: 'Test tool description',
          serverId: 'test',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const toolsByServer = new Map([['test', tools]]);

      // Act
      const result = await generatorWithoutDocs.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);

      const content = await fs.readFile(join(tempDir, 'MCP_test.ts'), 'utf-8');
      expect(content).not.toContain('/**');
      expect(content).not.toContain('Test tool description');
    });

    it('should use custom namespace prefix', async () => {
      // Arrange
      const configWithPrefix = {
        ...config,
        namespacePrefix: 'Custom',
      };

      const generatorWithPrefix = new TypeScriptGenerator({
        config: configWithPrefix,
      });

      const servers: MCPServerInfo[] = [
        { id: 'test', url: 'http://localhost', connected: true },
      ];

      const tools: ToolSchema[] = [
        {
          name: 'testTool',
          description: 'Test tool',
          serverId: 'test',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const toolsByServer = new Map([['test', tools]]);

      // Act
      const result = await generatorWithPrefix.generateAll(servers, toolsByServer);

      // Assert
      expect(result.success).toBe(true);

      const files = await fs.readdir(tempDir);
      expect(files).toContain('Custom_test.ts');

      const indexContent = await fs.readFile(join(tempDir, 'index.ts'), 'utf-8');
      expect(indexContent).toContain('Custom_test');
    });
  });

  describe('Generation Statistics', () => {
    it('should provide accurate generation statistics', async () => {
      // Arrange
      const servers: MCPServerInfo[] = [
        { id: 'server1', url: 'http://localhost:3001', connected: true },
        { id: 'server2', url: 'http://localhost:3002', connected: true },
      ];

      const toolsByServer = new Map([
        ['server1', [
          {
            name: 'tool1',
            description: 'Tool 1',
            serverId: 'server1',
            inputSchema: { type: 'object', properties: {} },
          },
        ]],
        ['server2', [
          {
            name: 'tool2',
            description: 'Tool 2',
            serverId: 'server2',
            inputSchema: { type: 'object', properties: {} },
          },
        ]],
      ]);

      // Act
      await generator.generateAll(servers, toolsByServer);
      const stats = generator.getGenerationStats();

      // Assert
      expect(stats.totalFiles).toBe(3); // 2 namespace files + 1 index file
      expect(stats.totalNamespaces).toBe(2);
      expect(stats.totalWarnings).toBe(0);
      expect(stats.outputDirectory).toBe(tempDir);
    });
  });
});