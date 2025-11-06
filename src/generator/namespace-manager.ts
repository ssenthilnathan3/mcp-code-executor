/**
 * NamespaceManager - Organizes MCP tools into logical namespaces and resolves conflicts
 */

import type { ToolSchema, NamespaceDefinition } from '../types/index.js';

/**
 * Options for namespace creation and conflict resolution
 */
export interface NamespaceManagerOptions {
  /** Prefix to add to all generated namespaces */
  namespacePrefix?: string;
  /** Strategy for resolving naming conflicts */
  conflictResolution: 'prefix' | 'suffix' | 'error';
  /** Whether to use server names as namespace names when available */
  useServerNames?: boolean;
  /** Custom namespace mappings for specific servers */
  customNamespaces?: Record<string, string>;
}

/**
 * Information about a naming conflict between tools
 */
export interface NamespaceConflict {
  /** The conflicting tool name */
  toolName: string;
  /** Server IDs that have tools with this name */
  serverIds: string[];
  /** The resolved names for each server */
  resolvedNames: Record<string, string>;
}

/**
 * Manages namespace creation and conflict resolution for MCP tools
 */
export class NamespaceManager {
  private options: NamespaceManagerOptions;

  constructor(options: NamespaceManagerOptions) {
    this.options = {
      conflictResolution: 'prefix',
      useServerNames: true,
      ...options,
    };
  }

  /**
   * Creates a namespace definition for a specific server's tools
   */
  createNamespace(serverId: string, tools: ToolSchema[]): NamespaceDefinition {
    const namespaceName = this.generateNamespaceName(serverId);
    
    return {
      name: namespaceName,
      serverId,
      tools,
      imports: this.generateImports(namespaceName, tools).split('\n'),
      exports: this.generateExports(namespaceName, tools).split('\n'),
    };
  }

  /**
   * Resolves naming conflicts between multiple namespaces
   */
  resolveConflicts(namespaces: NamespaceDefinition[]): NamespaceDefinition[] {
    const conflicts = this.detectConflicts(namespaces);
    
    if (conflicts.length === 0) {
      return namespaces;
    }

    return this.applyConflictResolution(namespaces, conflicts);
  }

  /**
   * Generates import statements for a namespace
   */
  generateImports(namespace: NamespaceDefinition): string;
  generateImports(namespaceName: string, tools: ToolSchema[]): string;
  generateImports(
    namespaceOrName: NamespaceDefinition | string,
    tools?: ToolSchema[]
  ): string {
    const toolList = typeof namespaceOrName === 'string' 
      ? tools! 
      : namespaceOrName.tools;

    const imports: string[] = [
      "import type { MCPBridge } from '../bridge/index.js';",
    ];

    // Add type imports for complex tool schemas
    const typeImports = this.generateTypeImports(toolList);
    if (typeImports.length > 0) {
      imports.push(...typeImports);
    }

    return imports.join('\n');
  }

  /**
   * Generates export statements for a namespace
   */
  generateExports(namespace: NamespaceDefinition): string;
  generateExports(namespaceName: string, tools: ToolSchema[]): string;
  generateExports(
    namespaceOrName: NamespaceDefinition | string,
    tools?: ToolSchema[]
  ): string {
    const namespaceName = typeof namespaceOrName === 'string' 
      ? namespaceOrName 
      : namespaceOrName.name;
    const toolList = typeof namespaceOrName === 'string' 
      ? tools! 
      : namespaceOrName.tools;

    const exports: string[] = [];

    // Export the main namespace object
    exports.push(`export { ${namespaceName} };`);

    // Export individual tool functions if needed
    const individualExports = toolList.map(tool => 
      this.sanitizeToolName(tool.name)
    );
    
    if (individualExports.length > 0) {
      exports.push(`export { ${individualExports.join(', ')} };`);
    }

    return exports.join('\n');
  }

  /**
   * Detects naming conflicts between tools across namespaces
   */
  private detectConflicts(namespaces: NamespaceDefinition[]): NamespaceConflict[] {
    const toolNameMap = new Map<string, string[]>();

    // Build map of tool names to server IDs
    for (const namespace of namespaces) {
      for (const tool of namespace.tools) {
        const toolName = tool.name;
        if (!toolNameMap.has(toolName)) {
          toolNameMap.set(toolName, []);
        }
        toolNameMap.get(toolName)!.push(namespace.serverId);
      }
    }

    // Find conflicts (tools with same name from different servers)
    const conflicts: NamespaceConflict[] = [];
    for (const [toolName, serverIds] of toolNameMap) {
      if (serverIds.length > 1) {
        conflicts.push({
          toolName,
          serverIds,
          resolvedNames: this.generateResolvedNames(toolName, serverIds),
        });
      }
    }

    return conflicts;
  }

  /**
   * Applies conflict resolution strategy to namespaces
   */
  private applyConflictResolution(
    namespaces: NamespaceDefinition[],
    conflicts: NamespaceConflict[]
  ): NamespaceDefinition[] {
    if (this.options.conflictResolution === 'error') {
      const conflictNames = conflicts.map(c => c.toolName).join(', ');
      throw new Error(`Tool name conflicts detected: ${conflictNames}`);
    }

    // Create a map of conflicts for quick lookup
    const conflictMap = new Map<string, NamespaceConflict>();
    for (const conflict of conflicts) {
      conflictMap.set(conflict.toolName, conflict);
    }

    // Apply resolution to each namespace
    return namespaces.map(namespace => {
      const resolvedTools = namespace.tools.map(tool => {
        const conflict = conflictMap.get(tool.name);
        if (conflict) {
          const resolvedName = conflict.resolvedNames[namespace.serverId];
          if (resolvedName) {
            return { ...tool, name: resolvedName };
          }
        }
        return tool;
      });

      return {
        ...namespace,
        tools: resolvedTools,
        imports: this.generateImports(namespace.name, resolvedTools).split('\n'),
        exports: this.generateExports(namespace.name, resolvedTools).split('\n'),
      };
    });
  }

  /**
   * Generates resolved names for conflicting tools
   */
  private generateResolvedNames(toolName: string, serverIds: string[]): Record<string, string> {
    const resolvedNames: Record<string, string> = {};

    for (const serverId of serverIds) {
      switch (this.options.conflictResolution) {
        case 'prefix':
          resolvedNames[serverId] = `${this.sanitizeServerId(serverId)}_${toolName}`;
          break;
        case 'suffix':
          resolvedNames[serverId] = `${toolName}_${this.sanitizeServerId(serverId)}`;
          break;
        default:
          resolvedNames[serverId] = toolName;
      }
    }

    return resolvedNames;
  }

  /**
   * Generates a namespace name for a server
   */
  private generateNamespaceName(serverId: string): string {
    // Check for custom namespace mapping
    if (this.options.customNamespaces?.[serverId]) {
      return this.applyNamespacePrefix(this.options.customNamespaces[serverId]);
    }

    // Use server ID as namespace name (sanitized)
    const sanitizedId = this.sanitizeServerId(serverId);
    return this.applyNamespacePrefix(sanitizedId);
  }

  /**
   * Applies namespace prefix if configured
   */
  private applyNamespacePrefix(name: string): string {
    if (this.options.namespacePrefix) {
      return `${this.options.namespacePrefix}_${name}`;
    }
    return name;
  }

  /**
   * Sanitizes server ID for use as namespace name
   */
  private sanitizeServerId(serverId: string): string {
    let sanitized = serverId
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    // Ensure it doesn't start with a number
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Sanitizes tool name for use as function name
   */
  private sanitizeToolName(toolName: string): string {
    let sanitized = toolName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    // Ensure it doesn't start with a number
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Generates type imports needed for tool schemas
   */
  private generateTypeImports(tools: ToolSchema[]): string[] {
    const typeImports: string[] = [];
    
    // Check if any tools have complex schemas that need type imports
    const hasComplexTypes = tools.some(tool => 
      this.hasComplexSchema(tool.inputSchema) || 
      (tool.outputSchema && this.hasComplexSchema(tool.outputSchema))
    );

    if (hasComplexTypes) {
      typeImports.push("import type { JSONSchema } from '../types/index.js';");
    }

    return typeImports;
  }

  /**
   * Checks if a schema is complex enough to need type imports
   */
  private hasComplexSchema(schema: any): boolean {
    return schema && (
      schema.type === 'object' ||
      schema.properties ||
      schema.items ||
      schema.anyOf ||
      schema.oneOf ||
      schema.allOf
    );
  }
}