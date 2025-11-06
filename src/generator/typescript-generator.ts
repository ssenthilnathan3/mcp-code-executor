/**
 * TypeScriptGenerator - Orchestrates the complete TypeScript generation process
 * 
 * This module coordinates the TypeMapper, NamespaceManager, and TemplateBuilder
 * to generate complete TypeScript API files from MCP tool schemas.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type {
    ToolSchema,
    NamespaceDefinition,
    GenerationResult,
    GenerationConfig,
    MCPServerInfo
} from '../types/index.js';
import { GenerationError } from '../types/errors.js';
import { TypeMapper, type TypeMapperOptions } from './type-mapper.js';
import { NamespaceManager, type NamespaceManagerOptions } from './namespace-manager.js';
import { TemplateBuilder, type TemplateBuilderOptions } from './template-builder.js';

/**
 * Options for TypeScript generation
 */
export interface TypeScriptGeneratorOptions {
    /** Configuration for the generation process */
    config: GenerationConfig;
    /** Options for type mapping */
    typeMapper?: TypeMapperOptions;
    /** Options for namespace management */
    namespaceManager?: NamespaceManagerOptions;
    /** Options for template building */
    templateBuilder?: TemplateBuilderOptions;
}

/**
 * Information about generated files
 */
export interface GeneratedFile {
    /** File path relative to output directory */
    path: string;
    /** Generated content */
    content: string;
    /** Namespace this file represents */
    namespace: NamespaceDefinition;
}

/**
 * TypeScriptGenerator orchestrates the complete generation process
 */
export class TypeScriptGenerator {
    private config: GenerationConfig;
    private typeMapper: TypeMapper;
    private namespaceManager: NamespaceManager;
    private templateBuilder: TemplateBuilder;
    private generatedFiles: GeneratedFile[] = [];
    private warnings: string[] = [];

    constructor(options: TypeScriptGeneratorOptions) {
        this.config = options.config;

        // Initialize components with provided options
        this.typeMapper = new TypeMapper({
            strictTypes: this.config.strictTypes ?? true,
            includeDocumentation: this.config.includeDocumentation,
            ...options.typeMapper,
        });

        if (this.config.namespacePrefix) {
            this.namespaceManager = new NamespaceManager({
                namespacePrefix: this.config.namespacePrefix,
                conflictResolution: 'prefix',
                useServerNames: true,
                ...options.namespaceManager,
            });
        }


        this.templateBuilder = new TemplateBuilder({
            includeDocumentation: this.config.includeDocumentation,
            strictTypes: this.config.strictTypes ?? true,
            ...options.templateBuilder,
        });
    }

    /**
     * Generates TypeScript APIs for all provided servers and tools
     */
    async generateAll(
        servers: MCPServerInfo[],
        toolsByServer: Map<string, ToolSchema[]>
    ): Promise<GenerationResult> {
        try {
            this.generatedFiles = [];
            this.warnings = [];

            // Create namespaces for each server
            const namespaces = this.createNamespaces(servers, toolsByServer);

            // Resolve naming conflicts
            const resolvedNamespaces = this.namespaceManager.resolveConflicts(namespaces);

            // Generate files for each namespace
            for (const namespace of resolvedNamespaces) {
                await this.generateNamespaceFile(namespace);
            }

            // Generate index file
            await this.generateIndexFile(resolvedNamespaces);

            // Write all files to disk
            await this.writeGeneratedFiles();

            return {
                success: true,
                generatedFiles: this.generatedFiles.map(f => f.path),
                warnings: this.warnings,
            };
        } catch (error) {
            return {
                success: false,
                generatedFiles: [],
                warnings: this.warnings,
                error: new GenerationError(
                    `TypeScript generation failed: ${error instanceof Error ? error.message : String(error)}`,
                    { originalError: error }
                ),
            };
        }
    }

    /**
     * Generates TypeScript API for a specific server
     */
    async generateForServer(
        server: MCPServerInfo,
        tools: ToolSchema[]
    ): Promise<string> {
        try {
            // Create namespace for the server
            const namespace = this.namespaceManager.createNamespace(server.id, tools);

            // Generate the namespace file content
            const content = this.templateBuilder.generateNamespaceFile(namespace);

            return content;
        } catch (error) {
            throw new GenerationError(
                `Failed to generate TypeScript for server ${server.id}: ${error instanceof Error ? error.message : String(error)}`,
                { serverId: server.id, originalError: error }
            );
        }
    }

    /**
     * Gets the output path for generated files
     */
    getOutputPath(): string {
        return this.config.outputDir;
    }

    /**
     * Gets the list of generated files
     */
    getGeneratedFiles(): GeneratedFile[] {
        return [...this.generatedFiles];
    }

    /**
     * Gets any warnings generated during the process
     */
    getWarnings(): string[] {
        return [...this.warnings];
    }

    /**
     * Creates namespaces for all servers
     */
    private createNamespaces(
        servers: MCPServerInfo[],
        toolsByServer: Map<string, ToolSchema[]>
    ): NamespaceDefinition[] {
        const namespaces: NamespaceDefinition[] = [];

        for (const server of servers) {
            const tools = toolsByServer.get(server.id) || [];

            if (tools.length === 0) {
                this.warnings.push(`Server ${server.id} has no tools, skipping namespace generation`);
                continue;
            }

            try {
                const namespace = this.namespaceManager.createNamespace(server.id, tools);
                namespaces.push(namespace);
            } catch (error) {
                this.warnings.push(
                    `Failed to create namespace for server ${server.id}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        return namespaces;
    }

    /**
     * Generates a TypeScript file for a namespace
     */
    private async generateNamespaceFile(namespace: NamespaceDefinition): Promise<void> {
        try {
            const content = this.templateBuilder.generateNamespaceFile(namespace);
            const fileName = `${namespace.name}.ts`;

            this.generatedFiles.push({
                path: fileName,
                content,
                namespace,
            });
        } catch (error) {
            throw new GenerationError(
                `Failed to generate namespace file for ${namespace.name}: ${error instanceof Error ? error.message : String(error)}`,
                { namespace: namespace.name, originalError: error }
            );
        }
    }

    /**
     * Generates the main index file that exports all namespaces
     */
    private async generateIndexFile(namespaces: NamespaceDefinition[]): Promise<void> {
        const lines: string[] = [];

        // Add file header
        if (this.config.includeDocumentation) {
            lines.push('/**');
            lines.push(' * Generated MCP TypeScript API Index');
            lines.push(` * Generated on: ${new Date().toISOString()}`);
            lines.push(' *');
            lines.push(' * This file exports all generated MCP tool namespaces.');
            lines.push(' * Do not modify this file directly - it will be regenerated.');
            lines.push(' */');
            lines.push('');
        }

        // Add imports for each namespace
        for (const namespace of namespaces) {
            lines.push(`export { default as ${namespace.name} } from './${namespace.name}.js';`);
            lines.push(`export * from './${namespace.name}.js';`);
        }

        // Add a combined export object
        if (namespaces.length > 0) {
            lines.push('');
            lines.push('// Combined namespace object');
            lines.push('export const MCP = {');

            for (const namespace of namespaces) {
                lines.push(`  ${namespace.name},`);
            }

            lines.push('};');
        }

        // Add type exports
        lines.push('');
        lines.push('// Re-export common types');
        lines.push("export type { ToolSchema, NamespaceDefinition, ExecutionResult } from '../types/index.js';");

        const content = lines.join('\n');

        this.generatedFiles.push({
            path: 'index.ts',
            content,
            namespace: {
                name: 'index',
                serverId: 'index',
                tools: [],
                imports: [],
                exports: [],
            },
        });
    }

    /**
     * Writes all generated files to disk
     */
    private async writeGeneratedFiles(): Promise<void> {
        // Ensure output directory exists
        await this.ensureDirectoryExists(this.config.outputDir);

        // Write each generated file
        for (const file of this.generatedFiles) {
            const filePath = join(this.config.outputDir, file.path);

            // Ensure the directory for this file exists
            await this.ensureDirectoryExists(dirname(filePath));

            try {
                await fs.writeFile(filePath, file.content, 'utf-8');
            } catch (error) {
                throw new GenerationError(
                    `Failed to write file ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
                    { filePath, originalError: error }
                );
            }
        }
    }

    /**
     * Ensures a directory exists, creating it if necessary
     */
    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.access(dirPath);
        } catch {
            try {
                await fs.mkdir(dirPath, { recursive: true });
            } catch (error) {
                throw new GenerationError(
                    `Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
                    { dirPath, originalError: error }
                );
            }
        }
    }

    /**
     * Validates the generation configuration
     */
    private validateConfig(): void {
        if (!this.config.outputDir) {
            throw new GenerationError('Output directory is required');
        }

        if (!this.config.typeScriptVersion) {
            throw new GenerationError('TypeScript version is required');
        }

        // Validate output directory is writable (this will be checked during file writing)
        // Additional validation can be added here as needed
    }

    /**
     * Cleans the output directory before generation
     */
    async cleanOutputDirectory(): Promise<void> {
        try {
            const exists = await fs.access(this.config.outputDir).then(() => true).catch(() => false);

            if (exists) {
                const files = await fs.readdir(this.config.outputDir);

                // Only remove TypeScript files to avoid removing other important files
                const tsFiles = files.filter(file => file.endsWith('.ts') || file.endsWith('.js'));

                for (const file of tsFiles) {
                    const filePath = join(this.config.outputDir, file);
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            this.warnings.push(
                `Failed to clean output directory: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Gets generation statistics
     */
    getGenerationStats(): {
        totalFiles: number;
        totalNamespaces: number;
        totalWarnings: number;
        outputDirectory: string;
    } {
        const namespaceFiles = this.generatedFiles.filter(f => f.path !== 'index.ts');

        return {
            totalFiles: this.generatedFiles.length,
            totalNamespaces: namespaceFiles.length,
            totalWarnings: this.warnings.length,
            outputDirectory: this.config.outputDir,
        };
    }
}