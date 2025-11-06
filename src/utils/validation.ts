/**
 * Validation functions for configuration and schema data
 */

import type {
  MCPExecutorConfig,
  MCPServerConfig,
  GenerationConfig,
  RuntimeConfig,
  LoggingConfig,
  DenoPermissions,
  JSONSchema,
  ToolSchema,
  NamespaceDefinition
} from '../types/index.js';
import { ValidationError } from '../types/errors.js';

/**
 * Validates an MCP server configuration
 */
export function validateMCPServerConfig(config: unknown): MCPServerConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Server config must be an object');
  }

  const serverConfig = config as Record<string, unknown>;

  if (!serverConfig.id || typeof serverConfig.id !== 'string') {
    throw new ValidationError('Server config must have a string id', 'id');
  }

  if (!serverConfig.url || typeof serverConfig.url !== 'string') {
    throw new ValidationError('Server config must have a string url', 'url');
  }

  if (serverConfig.timeout !== undefined && typeof serverConfig.timeout !== 'number') {
    throw new ValidationError('Server timeout must be a number', 'timeout');
  }

  if (serverConfig.retries !== undefined && typeof serverConfig.retries !== 'number') {
    throw new ValidationError('Server retries must be a number', 'retries');
  }

  if (serverConfig.name !== undefined && typeof serverConfig.name !== 'string') {
    throw new ValidationError('Server name must be a string', 'name');
  }

  return {
    id: serverConfig.id,
    url: serverConfig.url,
    timeout: serverConfig.timeout as number | undefined,
    retries: serverConfig.retries as number | undefined,
    name: serverConfig.name as string | undefined
  };
}

/**
 * Validates generation configuration
 */
export function validateGenerationConfig(config: unknown): GenerationConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Generation config must be an object');
  }

  const genConfig = config as Record<string, unknown>;

  if (!genConfig.outputDir || typeof genConfig.outputDir !== 'string') {
    throw new ValidationError('Generation config must have a string outputDir', 'outputDir');
  }

  if (genConfig.namespacePrefix !== undefined && typeof genConfig.namespacePrefix !== 'string') {
    throw new ValidationError('Namespace prefix must be a string', 'namespacePrefix');
  }

  if (typeof genConfig.includeDocumentation !== 'boolean') {
    throw new ValidationError('includeDocumentation must be a boolean', 'includeDocumentation');
  }

  if (!genConfig.typeScriptVersion || typeof genConfig.typeScriptVersion !== 'string') {
    throw new ValidationError('typeScriptVersion must be a string', 'typeScriptVersion');
  }

  if (genConfig.strictTypes !== undefined && typeof genConfig.strictTypes !== 'boolean') {
    throw new ValidationError('strictTypes must be a boolean', 'strictTypes');
  }

  return {
    outputDir: genConfig.outputDir,
    namespacePrefix: genConfig.namespacePrefix as string | undefined,
    includeDocumentation: genConfig.includeDocumentation,
    typeScriptVersion: genConfig.typeScriptVersion,
    strictTypes: genConfig.strictTypes as boolean | undefined
  };
}

/**
 * Validates Deno permissions configuration
 */
export function validateDenoPermissions(permissions: unknown): DenoPermissions {
  if (!permissions || typeof permissions !== 'object') {
    throw new ValidationError('Deno permissions must be an object');
  }

  const perms = permissions as Record<string, unknown>;
  const result: DenoPermissions = {};

  // Helper function to validate permission values
  const validatePermission = (key: string, value: unknown): boolean | string[] | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
      return value as string[];
    }
    throw new ValidationError(`Permission ${key} must be boolean or string array`, key);
  };

  result.allowNet = validatePermission('allowNet', perms.allowNet);
  result.allowRead = validatePermission('allowRead', perms.allowRead);
  result.allowWrite = validatePermission('allowWrite', perms.allowWrite);
  result.allowEnv = validatePermission('allowEnv', perms.allowEnv);
  result.allowRun = validatePermission('allowRun', perms.allowRun);

  if (perms.allowHrtime !== undefined && typeof perms.allowHrtime !== 'boolean') {
    throw new ValidationError('allowHrtime must be a boolean', 'allowHrtime');
  }
  result.allowHrtime = perms.allowHrtime as boolean | undefined;

  return result;
}

/**
 * Validates runtime configuration
 */
export function validateRuntimeConfig(config: unknown): RuntimeConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Runtime config must be an object');
  }

  const runtimeConfig = config as Record<string, unknown>;

  if (typeof runtimeConfig.timeout !== 'number' || runtimeConfig.timeout <= 0) {
    throw new ValidationError('Runtime timeout must be a positive number', 'timeout');
  }

  if (typeof runtimeConfig.memoryLimit !== 'number' || runtimeConfig.memoryLimit <= 0) {
    throw new ValidationError('Memory limit must be a positive number', 'memoryLimit');
  }

  const permissions = validateDenoPermissions(runtimeConfig.permissions);

  if (!Array.isArray(runtimeConfig.allowedModules)) {
    throw new ValidationError('allowedModules must be an array', 'allowedModules');
  }

  if (!runtimeConfig.allowedModules.every(m => typeof m === 'string')) {
    throw new ValidationError('All allowed modules must be strings', 'allowedModules');
  }

  if (runtimeConfig.enableDebugging !== undefined && typeof runtimeConfig.enableDebugging !== 'boolean') {
    throw new ValidationError('enableDebugging must be a boolean', 'enableDebugging');
  }

  return {
    timeout: runtimeConfig.timeout,
    memoryLimit: runtimeConfig.memoryLimit,
    permissions,
    allowedModules: runtimeConfig.allowedModules as string[],
    enableDebugging: runtimeConfig.enableDebugging as boolean | undefined
  };
}

/**
 * Validates logging configuration
 */
export function validateLoggingConfig(config: unknown): LoggingConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('Logging config must be an object');
  }

  const logConfig = config as Record<string, unknown>;
  const validLevels = ['debug', 'info', 'warn', 'error'];
  const validFormats = ['json', 'text'];

  if (!validLevels.includes(logConfig.level as string)) {
    throw new ValidationError(`Log level must be one of: ${validLevels.join(', ')}`, 'level');
  }

  if (!validFormats.includes(logConfig.format as string)) {
    throw new ValidationError(`Log format must be one of: ${validFormats.join(', ')}`, 'format');
  }

  if (typeof logConfig.includeTimestamp !== 'boolean') {
    throw new ValidationError('includeTimestamp must be a boolean', 'includeTimestamp');
  }

  if (typeof logConfig.includeStackTrace !== 'boolean') {
    throw new ValidationError('includeStackTrace must be a boolean', 'includeStackTrace');
  }

  return {
    level: logConfig.level as 'debug' | 'info' | 'warn' | 'error',
    format: logConfig.format as 'json' | 'text',
    includeTimestamp: logConfig.includeTimestamp,
    includeStackTrace: logConfig.includeStackTrace
  };
}

/**
 * Validates the main MCP executor configuration
 */
export function validateMCPExecutorConfig(config: unknown): MCPExecutorConfig {
  if (!config || typeof config !== 'object') {
    throw new ValidationError('MCP executor config must be an object');
  }

  const execConfig = config as Record<string, unknown>;

  if (!Array.isArray(execConfig.servers)) {
    throw new ValidationError('servers must be an array', 'servers');
  }

  if (execConfig.servers.length === 0) {
    throw new ValidationError('At least one server must be configured', 'servers');
  }

  const servers = execConfig.servers.map((server, index) => {
    try {
      return validateMCPServerConfig(server);
    } catch (error) {
      throw new ValidationError(
        `Invalid server config at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        `servers[${index}]`,
        { index },
        error instanceof Error ? error : undefined
      );
    }
  });

  // Check for duplicate server IDs
  const serverIds = new Set();
  for (const server of servers) {
    if (serverIds.has(server.id)) {
      throw new ValidationError(`Duplicate server ID: ${server.id}`, 'servers');
    }
    serverIds.add(server.id);
  }

  const generation = validateGenerationConfig(execConfig.generation);
  const runtime = validateRuntimeConfig(execConfig.runtime);
  const logging = validateLoggingConfig(execConfig.logging);

  return {
    servers,
    generation,
    runtime,
    logging
  };
}

/**
 * Validates a JSON Schema object
 */
export function validateJSONSchema(schema: unknown): JSONSchema {
  if (!schema || typeof schema !== 'object') {
    throw new ValidationError('JSON Schema must be an object');
  }

  const jsonSchema = schema as Record<string, unknown>;

  // Basic validation - JSON Schema is quite flexible, so we only validate the most common fields
  if (jsonSchema.type !== undefined) {
    if (typeof jsonSchema.type === 'string') {
      const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];
      if (!validTypes.includes(jsonSchema.type)) {
        throw new ValidationError(`Invalid JSON Schema type: ${jsonSchema.type}`, 'type');
      }
    } else if (Array.isArray(jsonSchema.type)) {
      if (!jsonSchema.type.every(t => typeof t === 'string')) {
        throw new ValidationError('JSON Schema type array must contain only strings', 'type');
      }
    } else {
      throw new ValidationError('JSON Schema type must be string or string array', 'type');
    }
  }

  if (jsonSchema.properties !== undefined && typeof jsonSchema.properties !== 'object') {
    throw new ValidationError('JSON Schema properties must be an object', 'properties');
  }

  if (jsonSchema.required !== undefined) {
    if (!Array.isArray(jsonSchema.required) || !jsonSchema.required.every(r => typeof r === 'string')) {
      throw new ValidationError('JSON Schema required must be an array of strings', 'required');
    }
  }

  return jsonSchema as JSONSchema;
}

/**
 * Validates a tool schema
 */
export function validateToolSchema(schema: unknown): ToolSchema {
  if (!schema || typeof schema !== 'object') {
    throw new ValidationError('Tool schema must be an object');
  }

  const toolSchema = schema as Record<string, unknown>;

  if (!toolSchema.name || typeof toolSchema.name !== 'string') {
    throw new ValidationError('Tool schema must have a string name', 'name');
  }

  if (!toolSchema.description || typeof toolSchema.description !== 'string') {
    throw new ValidationError('Tool schema must have a string description', 'description');
  }

  if (!toolSchema.serverId || typeof toolSchema.serverId !== 'string') {
    throw new ValidationError('Tool schema must have a string serverId', 'serverId');
  }

  const inputSchema = validateJSONSchema(toolSchema.inputSchema);
  
  let outputSchema: JSONSchema | undefined;
  if (toolSchema.outputSchema !== undefined) {
    outputSchema = validateJSONSchema(toolSchema.outputSchema);
  }

  return {
    name: toolSchema.name,
    description: toolSchema.description,
    serverId: toolSchema.serverId,
    inputSchema,
    outputSchema
  };
}

/**
 * Validates a namespace definition
 */
export function validateNamespaceDefinition(namespace: unknown): NamespaceDefinition {
  if (!namespace || typeof namespace !== 'object') {
    throw new ValidationError('Namespace definition must be an object');
  }

  const ns = namespace as Record<string, unknown>;

  if (!ns.name || typeof ns.name !== 'string') {
    throw new ValidationError('Namespace must have a string name', 'name');
  }

  if (!ns.serverId || typeof ns.serverId !== 'string') {
    throw new ValidationError('Namespace must have a string serverId', 'serverId');
  }

  if (!Array.isArray(ns.tools)) {
    throw new ValidationError('Namespace tools must be an array', 'tools');
  }

  const tools = ns.tools.map((tool, index) => {
    try {
      return validateToolSchema(tool);
    } catch (error) {
      throw new ValidationError(
        `Invalid tool schema at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        `tools[${index}]`,
        { index },
        error instanceof Error ? error : undefined
      );
    }
  });

  if (!Array.isArray(ns.imports) || !ns.imports.every(i => typeof i === 'string')) {
    throw new ValidationError('Namespace imports must be an array of strings', 'imports');
  }

  if (!Array.isArray(ns.exports) || !ns.exports.every(e => typeof e === 'string')) {
    throw new ValidationError('Namespace exports must be an array of strings', 'exports');
  }

  return {
    name: ns.name,
    serverId: ns.serverId,
    tools,
    imports: ns.imports as string[],
    exports: ns.exports as string[]
  };
}