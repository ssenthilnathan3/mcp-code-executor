/**
 * TemplateBuilder - Generates TypeScript code strings from templates
 * 
 * This module provides utilities for building TypeScript code strings with
 * proper formatting, JSDoc comments, and idiomatic TypeScript conventions.
 */

import type { ToolSchema, JSONSchema, NamespaceDefinition } from '../types/index.js';

/**
 * Options for template generation
 */
export interface TemplateBuilderOptions {
    /** Whether to include JSDoc comments */
    includeDocumentation?: boolean;
    /** Indentation string (default: 2 spaces) */
    indent?: string;
    /** Whether to use strict type checking */
    strictTypes?: boolean;
    /** Prefix for generated interface names */
    interfacePrefix?: string;
}

/**
 * Context for template generation
 */
interface TemplateContext {
    /** Current indentation level */
    indentLevel: number;
    /** Generated imports */
    imports: Set<string>;
    /** Generated type definitions */
    typeDefinitions: Map<string, string>;
}

/**
 * TemplateBuilder class for generating TypeScript code strings
 */
export class TemplateBuilder {
    private options: Required<TemplateBuilderOptions>;

    constructor(options: TemplateBuilderOptions = {}) {
        this.options = {
            includeDocumentation: true,
            indent: '  ',
            strictTypes: true,
            interfacePrefix: '',
            ...options,
        };
    }

    /**
     * Generates a complete namespace file with all tools
     */
    generateNamespaceFile(namespace: NamespaceDefinition): string {
        const context: TemplateContext = {
            indentLevel: 0,
            imports: new Set(),
            typeDefinitions: new Map(),
        };

        const parts: string[] = [];

        // Add file header comment
        if (this.options.includeDocumentation) {
            parts.push(this.generateFileHeader(namespace));
        }

        // Add imports
        parts.push(this.generateImports(namespace, context));

        // Add type definitions for tool schemas
        parts.push(this.generateTypeDefinitions(namespace, context));

        // Add namespace implementation
        parts.push(this.generateNamespaceImplementation(namespace, context));

        // Add exports
        parts.push(this.generateExports(namespace, context));

        return parts.filter(part => part.trim()).join('\n\n');
    }

    /**
     * Generates a tool function implementation
     */
    generateToolFunction(tool: ToolSchema, namespaceName: string): string {
        const context: TemplateContext = {
            indentLevel: 1,
            imports: new Set(),
            typeDefinitions: new Map(),
        };

        const parts: string[] = [];

        // Generate JSDoc comment
        if (this.options.includeDocumentation) {
            parts.push(this.generateToolJSDoc(tool, context));
        }

        // Generate function signature
        const inputType = this.generateInputType(tool.inputSchema, `${tool.name}Input`);
        const outputType = this.generateOutputType(tool.outputSchema, `${tool.name}Output`);

        const functionSignature = this.generateFunctionSignature(
            tool.name,
            inputType,
            outputType,
            context
        );

        parts.push(functionSignature);

        // Generate function body
        parts.push(this.generateFunctionBody(tool, namespaceName, context));

        return parts.join('\n');
    }

    /**
     * Generates JSDoc comment for a tool
     */
    generateToolJSDoc(tool: ToolSchema, context: TemplateContext): string {
        const indent = this.getIndent(context.indentLevel);
        const lines: string[] = [];

        lines.push(`${indent}/**`);
        lines.push(`${indent} * ${tool.description}`);

        if (tool.inputSchema.properties) {
            lines.push(`${indent} *`);
            for (const [paramName, paramSchema] of Object.entries(tool.inputSchema.properties)) {
                const isRequired = tool.inputSchema.required?.includes(paramName) ?? false;
                const paramType = this.getSchemaTypeString(paramSchema);
                const description = paramSchema.description || 'Parameter description';
                lines.push(`${indent} * @param ${paramName}${isRequired ? '' : '?'} {${paramType}} ${description}`);
            }
        }

        if (tool.outputSchema) {
            const outputType = this.generateOutputType(tool.outputSchema, `${tool.name}Output`);
            const returnDescription = tool.outputSchema.description || 'Tool execution result';
            lines.push(`${indent} * @returns {Promise<${outputType}>} ${returnDescription}`);
        } else {
            lines.push(`${indent} * @returns {Promise<unknown>} Tool execution result`);
        }

        lines.push(`${indent} */`);

        return lines.join('\n');
    }

    /**
     * Generates interface definition from JSON Schema
     */
    generateInterface(name: string, schema: JSONSchema): string {
        const lines: string[] = [];
        const sanitizedName = this.sanitizeTypeName(name);

        // Add JSDoc comment
        if (this.options.includeDocumentation && schema.description) {
            lines.push('/**');
            lines.push(` * ${schema.description}`);
            lines.push(' */');
        }

        lines.push(`export interface ${sanitizedName} {`);

        if (schema.properties) {
            const required = schema.required || [];

            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                const isRequired = required.includes(propName);
                const propType = this.getSchemaTypeString(propSchema);
                const optionalMarker = isRequired ? '' : '?';

                // Add property JSDoc if available
                if (this.options.includeDocumentation && propSchema.description) {
                    lines.push(`  /** ${propSchema.description} */`);
                }

                lines.push(`  ${propName}${optionalMarker}: ${propType};`);
            }
        }

        lines.push('}');

        return lines.join('\n');
    }

    /**
     * Generates file header comment
     */
    private generateFileHeader(namespace: NamespaceDefinition): string {
        const lines: string[] = [];
        lines.push('/**');
        lines.push(` * Generated namespace: ${namespace.name}`);
        lines.push(` * Server ID: ${namespace.serverId}`);
        lines.push(` * Generated on: ${new Date().toISOString()}`);
        lines.push(' *');
        lines.push(' * This file contains TypeScript API definitions for MCP tools.');
        lines.push(' * Do not modify this file directly - it will be regenerated.');
        lines.push(' */');
        return lines.join('\n');
    }

    /**
     * Generates import statements
     */
    private generateImports(namespace: NamespaceDefinition, context: TemplateContext): string {
        const imports = new Set<string>();

        // Always import MCPBridge
        imports.add("import type { MCPBridge } from '../bridge/index.js';");

        // Add any additional imports from namespace definition
        if (namespace.imports.length > 0) {
            namespace.imports.filter(imp => imp.trim()).forEach(imp => imports.add(imp));
        }

        // Check if we need JSONSchema import for complex types
        const hasComplexTypes = namespace.tools.some(tool =>
            this.hasComplexSchema(tool.inputSchema) ||
            (tool.outputSchema && this.hasComplexSchema(tool.outputSchema))
        );

        if (hasComplexTypes) {
            imports.add("import type { JSONSchema } from '../types/index.js';");
        }

        return Array.from(imports).join('\n');
    }

    /**
     * Generates type definitions for tool schemas
     */
    private generateTypeDefinitions(namespace: NamespaceDefinition, context: TemplateContext): string {
        const definitions: string[] = [];

        for (const tool of namespace.tools) {
            // Generate input type if needed
            if (this.needsTypeDefinition(tool.inputSchema)) {
                const inputTypeName = this.getTypeName(tool.name, 'Input');
                const inputInterface = this.generateInterface(inputTypeName, tool.inputSchema);
                definitions.push(inputInterface);
            }

            // Generate output type if needed
            if (tool.outputSchema && this.needsTypeDefinition(tool.outputSchema)) {
                const outputTypeName = this.getTypeName(tool.name, 'Output');
                const outputInterface = this.generateInterface(outputTypeName, tool.outputSchema);
                definitions.push(outputInterface);
            }
        }

        return definitions.join('\n\n');
    }

    /**
     * Generates namespace implementation
     */
    private generateNamespaceImplementation(namespace: NamespaceDefinition, context: TemplateContext): string {
        const lines: string[] = [];

        // Generate namespace JSDoc
        if (this.options.includeDocumentation) {
            lines.push('/**');
            lines.push(` * ${namespace.name} namespace containing MCP tools`);
            lines.push(` * Server: ${namespace.serverId}`);
            lines.push(' */');
        }

        lines.push(`export const ${namespace.name} = {`);

        // Generate tool functions
        for (let i = 0; i < namespace.tools.length; i++) {
            const tool = namespace.tools[i];
            if (tool) {
                const toolFunction = this.generateToolFunction(tool, namespace.name);
                lines.push(this.indentLines(toolFunction, 1));

                if (i < namespace.tools.length - 1) {
                    lines.push('');
                }
            }

        }

        lines.push('};');

        return lines.join('\n');
    }

    /**
     * Generates export statements
     */
    private generateExports(namespace: NamespaceDefinition, context: TemplateContext): string {
        const exports: string[] = [];

        // Export the namespace
        exports.push(`export default ${namespace.name};`);

        // Export individual tool functions if requested
        const toolNames = namespace.tools.map(tool => this.sanitizeToolName(tool.name));
        if (toolNames.length > 0) {
            exports.push(`export const { ${toolNames.join(', ')} } = ${namespace.name};`);
        }

        return exports.join('\n');
    }

    /**
     * Generates function signature for a tool
     */
    private generateFunctionSignature(
        toolName: string,
        inputType: string,
        outputType: string,
        context: TemplateContext
    ): string {
        const indent = this.getIndent(context.indentLevel);
        const sanitizedName = this.sanitizeToolName(toolName);

        return `${indent}async ${sanitizedName}(args: ${inputType}, bridge: MCPBridge): Promise<${outputType}> {`;
    }

    /**
     * Generates function body for a tool
     */
    private generateFunctionBody(
        tool: ToolSchema,
        namespaceName: string,
        context: TemplateContext
    ): string {
        const indent = this.getIndent(context.indentLevel + 1);
        const lines: string[] = [];

        lines.push(`${indent}return await bridge.callTool('${tool.serverId}', '${tool.name}', args);`);
        lines.push(`${this.getIndent(context.indentLevel)}}`);

        return lines.join('\n');
    }

    /**
     * Generates input type string for a tool
     */
    private generateInputType(schema: JSONSchema, typeName: string): string {
        if (this.needsTypeDefinition(schema)) {
            return this.getTypeName(typeName.replace('Input', ''), 'Input');
        }
        return this.getSchemaTypeString(schema);
    }

    /**
     * Generates output type string for a tool
     */
    private generateOutputType(schema: JSONSchema | undefined, typeName: string): string {
        if (!schema) {
            return 'unknown';
        }

        if (this.needsTypeDefinition(schema)) {
            return this.getTypeName(typeName.replace('Output', ''), 'Output');
        }

        return this.getSchemaTypeString(schema);
    }

    /**
     * Gets TypeScript type string for a JSON Schema
     */
    private getSchemaTypeString(schema: JSONSchema): string {
        if (!schema.type) {
            return 'unknown';
        }

        if (typeof schema.type === 'string') {
            switch (schema.type) {
                case 'string': return 'string';
                case 'number':
                case 'integer': return 'number';
                case 'boolean': return 'boolean';
                case 'array': return schema.items ? `${this.getSchemaTypeString(schema.items)}[]` : 'unknown[]';
                case 'object': return schema.properties ? 'object' : 'Record<string, unknown>';
                default: return 'unknown';
            }
        }

        if (Array.isArray(schema.type)) {
            const types = schema.type.map(type => {
                switch (type) {
                    case 'string': return 'string';
                    case 'number':
                    case 'integer': return 'number';
                    case 'boolean': return 'boolean';
                    default: return 'unknown';
                }
            });
            return types.join(' | ');
        }

        return 'unknown';
    }

    /**
     * Checks if a schema needs a separate type definition
     */
    private needsTypeDefinition(schema: JSONSchema): boolean {
        return !!(schema.properties && Object.keys(schema.properties).length > 0);
    }

    /**
     * Generates type name with prefix
     */
    private getTypeName(baseName: string, suffix: string): string {
        const sanitized = this.sanitizeTypeName(baseName);
        return `${this.options.interfacePrefix}${sanitized}${suffix}`;
    }

    /**
     * Sanitizes tool name for use as function name
     */
    private sanitizeToolName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^[0-9]/, '_$&')
            .replace(/_+/g, '_');
    }

    /**
     * Sanitizes type name for use as interface name
     */
    private sanitizeTypeName(name: string): string {
        // First, handle special characters and convert to PascalCase
        const sanitized = name
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^[0-9]/, '_$&')
            .replace(/_+/g, '_')
            .split(/[_\s-]+/)
            .filter(part => part.length > 0)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('');

        return sanitized || 'Anonymous';
    }

    /**
     * Gets indentation string for a given level
     */
    private getIndent(level: number): string {
        return this.options.indent.repeat(level);
    }

    /**
     * Indents all lines in a string by the specified level
     */
    private indentLines(text: string, level: number): string {
        const indent = this.getIndent(level);
        return text.split('\n').map(line => line ? indent + line : line).join('\n');
    }

    /**
     * Checks if a schema is complex enough to need type imports
     */
    private hasComplexSchema(schema: JSONSchema): boolean {
        return Boolean(schema && (
            schema.type === 'object' ||
            schema.properties ||
            schema.items ||
            schema.anyOf ||
            schema.oneOf ||
            schema.allOf)
        );
    }
}