/**
 * Unit tests for validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateMCPServerConfig,
  validateGenerationConfig,
  validateDenoPermissions,
  validateRuntimeConfig,
  validateLoggingConfig,
  validateMCPExecutorConfig,
  validateJSONSchema,
  validateToolSchema,
  validateNamespaceDefinition
} from './validation.js';
import { ValidationError } from '../types/errors.js';

describe('validateMCPServerConfig', () => {
  it('should validate a valid server config', () => {
    const config = {
      id: 'test-server',
      url: 'http://localhost:3000',
      timeout: 5000,
      retries: 3,
      name: 'Test Server'
    };

    const result = validateMCPServerConfig(config);
    expect(result).toEqual(config);
  });

  it('should validate minimal server config', () => {
    const config = {
      id: 'test-server',
      url: 'http://localhost:3000'
    };

    const result = validateMCPServerConfig(config);
    expect(result).toEqual({
      id: 'test-server',
      url: 'http://localhost:3000',
      timeout: undefined,
      retries: undefined,
      name: undefined
    });
  });

  it('should throw ValidationError for missing id', () => {
    const config = {
      url: 'http://localhost:3000'
    };

    expect(() => validateMCPServerConfig(config)).toThrow(ValidationError);
    expect(() => validateMCPServerConfig(config)).toThrow('Server config must have a string id');
  });

  it('should throw ValidationError for missing url', () => {
    const config = {
      id: 'test-server'
    };

    expect(() => validateMCPServerConfig(config)).toThrow(ValidationError);
    expect(() => validateMCPServerConfig(config)).toThrow('Server config must have a string url');
  });

  it('should throw ValidationError for invalid timeout type', () => {
    const config = {
      id: 'test-server',
      url: 'http://localhost:3000',
      timeout: 'invalid'
    };

    expect(() => validateMCPServerConfig(config)).toThrow(ValidationError);
    expect(() => validateMCPServerConfig(config)).toThrow('Server timeout must be a number');
  });

  it('should throw ValidationError for non-object input', () => {
    expect(() => validateMCPServerConfig(null)).toThrow(ValidationError);
    expect(() => validateMCPServerConfig('string')).toThrow(ValidationError);
    expect(() => validateMCPServerConfig(123)).toThrow(ValidationError);
  });
});

describe('validateGenerationConfig', () => {
  it('should validate a valid generation config', () => {
    const config = {
      outputDir: './generated',
      namespacePrefix: 'mcp',
      includeDocumentation: true,
      typeScriptVersion: '5.0.0',
      strictTypes: true
    };

    const result = validateGenerationConfig(config);
    expect(result).toEqual(config);
  });

  it('should validate minimal generation config', () => {
    const config = {
      outputDir: './generated',
      includeDocumentation: true,
      typeScriptVersion: '5.0.0'
    };

    const result = validateGenerationConfig(config);
    expect(result).toEqual({
      outputDir: './generated',
      namespacePrefix: undefined,
      includeDocumentation: true,
      typeScriptVersion: '5.0.0',
      strictTypes: undefined
    });
  });

  it('should throw ValidationError for missing outputDir', () => {
    const config = {
      includeDocumentation: true,
      typeScriptVersion: '5.0.0'
    };

    expect(() => validateGenerationConfig(config)).toThrow(ValidationError);
    expect(() => validateGenerationConfig(config)).toThrow('Generation config must have a string outputDir');
  });

  it('should throw ValidationError for invalid includeDocumentation type', () => {
    const config = {
      outputDir: './generated',
      includeDocumentation: 'yes',
      typeScriptVersion: '5.0.0'
    };

    expect(() => validateGenerationConfig(config)).toThrow(ValidationError);
    expect(() => validateGenerationConfig(config)).toThrow('includeDocumentation must be a boolean');
  });
});

describe('validateDenoPermissions', () => {
  it('should validate valid permissions with boolean values', () => {
    const permissions = {
      allowNet: true,
      allowRead: false,
      allowWrite: true,
      allowEnv: false,
      allowRun: false,
      allowHrtime: true
    };

    const result = validateDenoPermissions(permissions);
    expect(result).toEqual(permissions);
  });

  it('should validate valid permissions with string arrays', () => {
    const permissions = {
      allowNet: ['example.com', 'api.test.com'],
      allowRead: ['/tmp', '/var/log'],
      allowWrite: ['/tmp'],
      allowEnv: ['NODE_ENV', 'DEBUG'],
      allowRun: ['git', 'npm']
    };

    const result = validateDenoPermissions(permissions);
    expect(result).toEqual(permissions);
  });

  it('should validate empty permissions object', () => {
    const permissions = {};
    const result = validateDenoPermissions(permissions);
    expect(result).toEqual({});
  });

  it('should throw ValidationError for invalid permission type', () => {
    const permissions = {
      allowNet: 'invalid'
    };

    expect(() => validateDenoPermissions(permissions)).toThrow(ValidationError);
    expect(() => validateDenoPermissions(permissions)).toThrow('Permission allowNet must be boolean or string array');
  });

  it('should throw ValidationError for mixed array types', () => {
    const permissions = {
      allowRead: ['valid', 123, 'also-valid']
    };

    expect(() => validateDenoPermissions(permissions)).toThrow(ValidationError);
    expect(() => validateDenoPermissions(permissions)).toThrow('Permission allowRead must be boolean or string array');
  });
});

describe('validateRuntimeConfig', () => {
  it('should validate a valid runtime config', () => {
    const config = {
      timeout: 30000,
      memoryLimit: 1024 * 1024 * 100, // 100MB
      permissions: {
        allowNet: true,
        allowRead: ['/tmp']
      },
      allowedModules: ['https://deno.land/std/', 'npm:lodash'],
      enableDebugging: true
    };

    const result = validateRuntimeConfig(config);
    expect(result).toEqual(config);
  });

  it('should throw ValidationError for invalid timeout', () => {
    const config = {
      timeout: -1000,
      memoryLimit: 1024,
      permissions: {},
      allowedModules: []
    };

    expect(() => validateRuntimeConfig(config)).toThrow(ValidationError);
    expect(() => validateRuntimeConfig(config)).toThrow('Runtime timeout must be a positive number');
  });

  it('should throw ValidationError for invalid memory limit', () => {
    const config = {
      timeout: 30000,
      memoryLimit: 0,
      permissions: {},
      allowedModules: []
    };

    expect(() => validateRuntimeConfig(config)).toThrow(ValidationError);
    expect(() => validateRuntimeConfig(config)).toThrow('Memory limit must be a positive number');
  });

  it('should throw ValidationError for non-array allowedModules', () => {
    const config = {
      timeout: 30000,
      memoryLimit: 1024,
      permissions: {},
      allowedModules: 'not-an-array'
    };

    expect(() => validateRuntimeConfig(config)).toThrow(ValidationError);
    expect(() => validateRuntimeConfig(config)).toThrow('allowedModules must be an array');
  });
});

describe('validateLoggingConfig', () => {
  it('should validate a valid logging config', () => {
    const config = {
      level: 'info' as const,
      format: 'json' as const,
      includeTimestamp: true,
      includeStackTrace: false
    };

    const result = validateLoggingConfig(config);
    expect(result).toEqual(config);
  });

  it('should throw ValidationError for invalid log level', () => {
    const config = {
      level: 'invalid',
      format: 'json',
      includeTimestamp: true,
      includeStackTrace: false
    };

    expect(() => validateLoggingConfig(config)).toThrow(ValidationError);
    expect(() => validateLoggingConfig(config)).toThrow('Log level must be one of: debug, info, warn, error');
  });

  it('should throw ValidationError for invalid format', () => {
    const config = {
      level: 'info',
      format: 'xml',
      includeTimestamp: true,
      includeStackTrace: false
    };

    expect(() => validateLoggingConfig(config)).toThrow(ValidationError);
    expect(() => validateLoggingConfig(config)).toThrow('Log format must be one of: json, text');
  });
});

describe('validateMCPExecutorConfig', () => {
  it('should validate a complete valid config', () => {
    const config = {
      servers: [
        {
          id: 'server1',
          url: 'http://localhost:3000'
        },
        {
          id: 'server2',
          url: 'http://localhost:3001',
          timeout: 5000
        }
      ],
      generation: {
        outputDir: './generated',
        includeDocumentation: true,
        typeScriptVersion: '5.0.0'
      },
      runtime: {
        timeout: 30000,
        memoryLimit: 1024 * 1024 * 100,
        permissions: {
          allowNet: true
        },
        allowedModules: ['https://deno.land/std/']
      },
      logging: {
        level: 'info' as const,
        format: 'json' as const,
        includeTimestamp: true,
        includeStackTrace: false
      }
    };

    const result = validateMCPExecutorConfig(config);
    expect(result).toEqual(config);
  });

  it('should throw ValidationError for empty servers array', () => {
    const config = {
      servers: [],
      generation: {
        outputDir: './generated',
        includeDocumentation: true,
        typeScriptVersion: '5.0.0'
      },
      runtime: {
        timeout: 30000,
        memoryLimit: 1024,
        permissions: {},
        allowedModules: []
      },
      logging: {
        level: 'info',
        format: 'json',
        includeTimestamp: true,
        includeStackTrace: false
      }
    };

    expect(() => validateMCPExecutorConfig(config)).toThrow(ValidationError);
    expect(() => validateMCPExecutorConfig(config)).toThrow('At least one server must be configured');
  });

  it('should throw ValidationError for duplicate server IDs', () => {
    const config = {
      servers: [
        { id: 'server1', url: 'http://localhost:3000' },
        { id: 'server1', url: 'http://localhost:3001' }
      ],
      generation: {
        outputDir: './generated',
        includeDocumentation: true,
        typeScriptVersion: '5.0.0'
      },
      runtime: {
        timeout: 30000,
        memoryLimit: 1024,
        permissions: {},
        allowedModules: []
      },
      logging: {
        level: 'info',
        format: 'json',
        includeTimestamp: true,
        includeStackTrace: false
      }
    };

    expect(() => validateMCPExecutorConfig(config)).toThrow(ValidationError);
    expect(() => validateMCPExecutorConfig(config)).toThrow('Duplicate server ID: server1');
  });
});

describe('validateJSONSchema', () => {
  it('should validate a basic JSON schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    };

    const result = validateJSONSchema(schema);
    expect(result).toEqual(schema);
  });

  it('should validate schema with array type', () => {
    const schema = {
      type: ['string', 'null'],
      description: 'A nullable string'
    };

    const result = validateJSONSchema(schema);
    expect(result).toEqual(schema);
  });

  it('should throw ValidationError for invalid type', () => {
    const schema = {
      type: 'invalid-type'
    };

    expect(() => validateJSONSchema(schema)).toThrow(ValidationError);
    expect(() => validateJSONSchema(schema)).toThrow('Invalid JSON Schema type: invalid-type');
  });

  it('should throw ValidationError for invalid required field', () => {
    const schema = {
      type: 'object',
      required: 'should-be-array'
    };

    expect(() => validateJSONSchema(schema)).toThrow(ValidationError);
    expect(() => validateJSONSchema(schema)).toThrow('JSON Schema required must be an array of strings');
  });
});

describe('validateToolSchema', () => {
  it('should validate a complete tool schema', () => {
    const schema = {
      name: 'test-tool',
      description: 'A test tool',
      serverId: 'test-server',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' }
        }
      }
    };

    const result = validateToolSchema(schema);
    expect(result).toEqual(schema);
  });

  it('should validate tool schema without output schema', () => {
    const schema = {
      name: 'test-tool',
      description: 'A test tool',
      serverId: 'test-server',
      inputSchema: {
        type: 'object'
      }
    };

    const result = validateToolSchema(schema);
    expect(result).toEqual({
      ...schema,
      outputSchema: undefined
    });
  });

  it('should throw ValidationError for missing name', () => {
    const schema = {
      description: 'A test tool',
      serverId: 'test-server',
      inputSchema: { type: 'object' }
    };

    expect(() => validateToolSchema(schema)).toThrow(ValidationError);
    expect(() => validateToolSchema(schema)).toThrow('Tool schema must have a string name');
  });
});

describe('validateNamespaceDefinition', () => {
  it('should validate a complete namespace definition', () => {
    const namespace = {
      name: 'test-namespace',
      serverId: 'test-server',
      tools: [
        {
          name: 'tool1',
          description: 'First tool',
          serverId: 'test-server',
          inputSchema: { type: 'object' }
        }
      ],
      imports: ['import { Tool } from "./types";'],
      exports: ['export { tool1 };']
    };

    const result = validateNamespaceDefinition(namespace);
    expect(result).toEqual(namespace);
  });

  it('should throw ValidationError for invalid tool in tools array', () => {
    const namespace = {
      name: 'test-namespace',
      serverId: 'test-server',
      tools: [
        {
          // missing name
          description: 'First tool',
          serverId: 'test-server',
          inputSchema: { type: 'object' }
        }
      ],
      imports: [],
      exports: []
    };

    expect(() => validateNamespaceDefinition(namespace)).toThrow(ValidationError);
    expect(() => validateNamespaceDefinition(namespace)).toThrow('Invalid tool schema at index 0');
  });

  it('should throw ValidationError for non-array imports', () => {
    const namespace = {
      name: 'test-namespace',
      serverId: 'test-server',
      tools: [],
      imports: 'not-an-array',
      exports: []
    };

    expect(() => validateNamespaceDefinition(namespace)).toThrow(ValidationError);
    expect(() => validateNamespaceDefinition(namespace)).toThrow('Namespace imports must be an array of strings');
  });
});