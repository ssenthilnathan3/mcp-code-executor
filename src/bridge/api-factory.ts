/**
 * API Factory for generating namespace API code with bridge integration
 */

import type { NamespaceDefinition, ToolSchema } from '../types/index.js';
import type { IMCPBridge } from './mcp-bridge.js';
import { GenerationError } from '../types/errors.js';

/**
 * Configuration for API generation
 */
export interface ApiGenerationConfig {
    /** Whether to include JSDoc comments */
    includeDocumentation: boolean;
    /** Whether to generate strict types */
    strictTypes: boolean;
    /** Custom type mappings */
    typeMapping?: Record<string, string>;
    /** Whether to include runtime validation */
    includeValidation: boolean;
}

/**
 * Interface for the API Factory
 */
export interface IApiFactory {
    /**
     * Create namespace API code from a namespace definition
     */
    createNamespaceApi(definition: NamespaceDefinition, config?: ApiGenerationConfig): Promise<string>;

    /**
     * Generate proxy code for a set of tools
     */
    generateProxyCode(tools: ToolSchema[], config?: ApiGenerationConfig): string;

    /**
     * Inject bridge reference into generated code
     */
    injectBridgeReference(code: string, bridgeVariableName?: string): string;

    /**
     * Generate TypeScript interface definitions for tools
     */
    generateToolInterfaces(tools: ToolSchema[], config?: ApiGenerationConfig): string;

    /**
     * Dynamically load a generated API module
     */
    loadGeneratedModule(modulePath: string): Promise<any>;

    /**
     * Create a runtime API instance from generated code
     */
    createRuntimeApi(namespace: NamespaceDefinition, outputDir: string): Promise<any>;
}

/**
 * API Factory implementation for generating namespace APIs
 */
export class ApiFactory implements IApiFactory {
    private moduleCache = new Map<string, any>();

    constructor(private readonly bridge?: IMCPBridge) { }

    /**
     * Create namespace API code from a namespace definition
     */
    async createNamespaceApi(
        definition: NamespaceDefinition,
        config: ApiGenerationConfig = this.getDefaultConfig()
    ): Promise<string> {
        try {
            const { name, tools, imports, exports } = definition;

            const parts: string[] = [];

            // Add file header
            parts.push(this.generateFileHeader(name, config));

            // Add imports
            if (imports.length > 0) {
                parts.push(imports.join('\n'));
                parts.push('');
            }

            // Add tool interfaces
            if (config.strictTypes) {
                parts.push(this.generateToolInterfaces(tools, config));
                parts.push('');
            }

            // Add proxy code
            parts.push(this.generateProxyCode(tools, config));
            parts.push('');

            // Add exports
            if (exports.length > 0) {
                parts.push(exports.join('\n'));
            }

            let code = parts.join('\n');

            // Inject bridge reference if available
            if (this.bridge) {
                code = this.injectBridgeReference(code);
            }

            return code;
        } catch (error) {
            throw new GenerationError(
                `Failed to create namespace API for ${definition.name}`,
                undefined,
                { namespace: definition.name },
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    /**
     * Generate proxy code for a set of tools
     */
    generateProxyCode(
        tools: ToolSchema[],
        config: ApiGenerationConfig = this.getDefaultConfig()
    ): string {
        const parts: string[] = [];

        // Generate individual tool functions
        for (const tool of tools) {
            parts.push(this.generateToolFunction(tool, config));
            parts.push('');
        }

        // Generate namespace object
        parts.push(this.generateNamespaceObject(tools, config));

        return parts.join('\n');
    }

    /**
     * Inject bridge reference into generated code
     */
    injectBridgeReference(code: string, bridgeVariableName = '__bridge'): string {
        // Add bridge import at the top
        const bridgeImport = `import type { IMCPBridge } from '@mcp-code-executor/bridge';\n`;

        // Add bridge variable declaration
        const bridgeDeclaration = `\n// Bridge reference injected at runtime\ndeclare const ${bridgeVariableName}: IMCPBridge;\n`;

        // Replace placeholder calls with actual bridge calls
        const bridgeCode = code.replace(
            /\/\* BRIDGE_CALL \*\//g,
            `${bridgeVariableName}.interceptCall`
        );

        return bridgeImport + bridgeDeclaration + bridgeCode;
    }

    /**
     * Generate TypeScript interface definitions for tools
     */
    generateToolInterfaces(
        tools: ToolSchema[],
        config: ApiGenerationConfig = this.getDefaultConfig()
    ): string {
        const parts: string[] = [];

        if (config.includeDocumentation) {
            parts.push('/**');
            parts.push(' * TypeScript interfaces for MCP tools');
            parts.push(' */');
            parts.push('');
        }

        for (const tool of tools) {
            parts.push(this.generateToolInterface(tool, config));
            parts.push('');
        }

        return parts.join('\n');
    }

    /**
     * Generate a TypeScript interface for a single tool
     */
    private generateToolInterface(tool: ToolSchema, config: ApiGenerationConfig): string {
        const parts: string[] = [];

        if (config.includeDocumentation && tool.description) {
            parts.push('/**');
            parts.push(` * ${tool.description}`);
            parts.push(' */');
        }

        // Generate input interface
        const inputInterfaceName = this.getInterfaceName(tool.name, 'Input');
        parts.push(`export interface ${inputInterfaceName} {`);

        if (tool.inputSchema.properties) {
            for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
                const isRequired = tool.inputSchema.required?.includes(propName) ?? false;
                const optional = isRequired ? '' : '?';
                const typeString = this.jsonSchemaToTypeScript(propSchema, config);

                if (config.includeDocumentation && propSchema.description) {
                    parts.push(`  /** ${propSchema.description} */`);
                }

                parts.push(`  ${propName}${optional}: ${typeString};`);
            }
        }

        parts.push('}');
        parts.push('');

        // Generate output interface if available
        if (tool.outputSchema) {
            const outputInterfaceName = this.getInterfaceName(tool.name, 'Output');
            parts.push(`export interface ${outputInterfaceName} {`);

            if (tool.outputSchema.properties) {
                for (const [propName, propSchema] of Object.entries(tool.outputSchema.properties)) {
                    const isRequired = tool.outputSchema.required?.includes(propName) ?? false;
                    const optional = isRequired ? '' : '?';
                    const typeString = this.jsonSchemaToTypeScript(propSchema, config);

                    if (config.includeDocumentation && propSchema.description) {
                        parts.push(`  /** ${propSchema.description} */`);
                    }

                    parts.push(`  ${propName}${optional}: ${typeString};`);
                }
            }

            parts.push('}');
        }

        return parts.join('\n');
    }

    /**
     * Generate a function for a single tool
     */
    private generateToolFunction(tool: ToolSchema, config: ApiGenerationConfig): string {
        const parts: string[] = [];

        if (config.includeDocumentation) {
            parts.push('/**');
            parts.push(` * ${tool.description || `Call ${tool.name} tool`}`);

            if (tool.inputSchema.properties) {
                parts.push(' * @param args - Tool arguments');
                for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
                    if (propSchema.description) {
                        parts.push(` * @param args.${propName} - ${propSchema.description}`);
                    }
                }
            }

            parts.push(' * @returns Promise resolving to tool result');
            parts.push(' */');
        }

        const inputType = config.strictTypes
            ? this.getInterfaceName(tool.name, 'Input')
            : 'any';

        const outputType = config.strictTypes && tool.outputSchema
            ? this.getInterfaceName(tool.name, 'Output')
            : 'any';

        const functionName = this.sanitizeFunctionName(tool.name);

        parts.push(`export async function ${functionName}(args: ${inputType}): Promise<${outputType}> {`);

        if (config.includeValidation) {
            parts.push(`  // Runtime validation would go here`);
            parts.push(`  // validateInput(args, ${JSON.stringify(tool.inputSchema)});`);
            parts.push('');
        }

        parts.push(`  return /* BRIDGE_CALL */('${tool.serverId}', '${tool.name}', [args]);`);
        parts.push('}');

        return parts.join('\n');
    }

    /**
     * Generate namespace object containing all tools
     */
    private generateNamespaceObject(tools: ToolSchema[], config: ApiGenerationConfig): string {
        const parts: string[] = [];

        if (config.includeDocumentation) {
            parts.push('/**');
            parts.push(' * Namespace object containing all tools');
            parts.push(' */');
        }

        parts.push('export const tools = {');

        for (const tool of tools) {
            const functionName = this.sanitizeFunctionName(tool.name);
            parts.push(`  ${functionName},`);
        }

        parts.push('};');
        parts.push('');
        parts.push('export default tools;');

        return parts.join('\n');
    }

    /**
     * Generate file header with imports and metadata
     */
    private generateFileHeader(namespaceName: string, config: ApiGenerationConfig): string {
        const parts: string[] = [];

        if (config.includeDocumentation) {
            parts.push('/**');
            parts.push(` * Generated API for ${namespaceName} namespace`);
            parts.push(' * This file is auto-generated. Do not edit manually.');
            parts.push(` * Generated at: ${new Date().toISOString()}`);
            parts.push(' */');
            parts.push('');
        }

        // Add necessary imports
        parts.push("// Auto-generated imports");

        return parts.join('\n');
    }

    /**
     * Convert JSON Schema to TypeScript type string
     */
    private jsonSchemaToTypeScript(schema: any, config: ApiGenerationConfig): string | undefined {
        // Apply custom type mappings first
        if (config.typeMapping && typeof schema.type === 'string' && config.typeMapping[schema.type]) {
            return config.typeMapping[schema.type];
        }

        if (schema.type === 'string') {
            if (schema.enum) {
                return schema.enum.map((val: any) => `'${val}'`).join(' | ');
            }
            return 'string';
        }

        if (schema.type === 'number' || schema.type === 'integer') {
            return 'number';
        }

        if (schema.type === 'boolean') {
            return 'boolean';
        }

        if (schema.type === 'array') {
            const itemType = schema.items
                ? this.jsonSchemaToTypeScript(schema.items, config)
                : 'any';
            return `${itemType}[]`;
        }

        if (schema.type === 'object' || schema.properties) {
            return 'Record<string, any>';
        }

        if (schema.anyOf) {
            return schema.anyOf
                .map((subSchema: any) => this.jsonSchemaToTypeScript(subSchema, config))
                .join(' | ');
        }

        if (schema.oneOf) {
            return schema.oneOf
                .map((subSchema: any) => this.jsonSchemaToTypeScript(subSchema, config))
                .join(' | ');
        }

        return 'any';
    }

    /**
     * Get interface name for a tool
     */
    private getInterfaceName(toolName: string, suffix: string): string {
        const baseName = toolName
            .split(/[-_.]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');

        return `${baseName}${suffix}`;
    }

    /**
     * Sanitize function name to be valid TypeScript identifier
     */
    private sanitizeFunctionName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9_$]/g, '_')
            .replace(/^[0-9]/, '_$&');
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): ApiGenerationConfig {
        return {
            includeDocumentation: true,
            strictTypes: true,
            includeValidation: false
        };
    }

    /**
     * Dynamically load a generated API module
     */
    async loadGeneratedModule(modulePath: string): Promise<any> {
        // Check cache first
        if (this.moduleCache.has(modulePath)) {
            return this.moduleCache.get(modulePath);
        }

        try {
            // Dynamic import of the generated module
            const module = await import(modulePath);
            
            // Cache the loaded module
            this.moduleCache.set(modulePath, module);
            
            return module;
        } catch (error) {
            throw new GenerationError(
                `Failed to load generated module: ${modulePath}`,
                undefined,
                { modulePath },
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    /**
     * Create a runtime API instance from generated code
     */
    async createRuntimeApi(
        namespace: NamespaceDefinition,
        outputDir: string
    ): Promise<any> {
        // Generate the API code
        const code = await this.createNamespaceApi(namespace);
        
        // Write to a temporary file for dynamic loading
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const fileName = `${namespace.name}.js`;
        const filePath = path.join(outputDir, fileName);
        
        try {
            // Ensure directory exists
            await fs.mkdir(outputDir, { recursive: true });
            
            // Convert TypeScript to JavaScript (simplified - in real implementation would use TypeScript compiler)
            const jsCode = this.convertToJavaScript(code);
            
            // Write the file
            await fs.writeFile(filePath, jsCode, 'utf-8');
            
            // Load the module
            const module = await this.loadGeneratedModule(filePath);
            
            return module;
        } catch (error) {
            throw new GenerationError(
                `Failed to create runtime API for namespace ${namespace.name}`,
                undefined,
                { namespace: namespace.name, outputDir },
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    /**
     * Convert TypeScript code to JavaScript (simplified implementation)
     */
    private convertToJavaScript(tsCode: string): string {
        // This is a simplified conversion - in a real implementation,
        // you would use the TypeScript compiler API
        return tsCode
            .replace(/import type[^;]*;\s*/g, '') // Remove type imports
            .replace(/export interface[^}]*}\s*/g, '') // Remove export interface definitions
            .replace(/interface \w+[^}]*}\s*/g, '') // Remove interface definitions
            .replace(/declare const[^;]*;\s*/g, '') // Remove declare statements
            .replace(/: [^=,;)}\]{]+(?=[,;)}\]{])/g, '') // Remove parameter type annotations
            .replace(/\): [^{]+(?=\s*{)/g, ')') // Remove return type annotations
            .replace(/\n\s*\n/g, '\n') // Clean up extra newlines
            .trim(); // Remove leading/trailing whitespace
    }

    /**
     * Clear the module cache
     */
    clearModuleCache(): void {
        this.moduleCache.clear();
    }

    /**
     * Get module cache statistics
     */
    getModuleCacheStats(): { size: number; modules: string[] } {
        return {
            size: this.moduleCache.size,
            modules: Array.from(this.moduleCache.keys())
        };
    }

    /**
     * Preload multiple modules
     */
    async preloadModules(modulePaths: string[]): Promise<void> {
        const loadPromises = modulePaths.map(path => this.loadGeneratedModule(path));
        await Promise.all(loadPromises);
    }
}