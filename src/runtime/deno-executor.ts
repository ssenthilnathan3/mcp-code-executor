/**
 * Secure Deno sandbox executor for running TypeScript code
 */

import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ExecutionResult,
  ExecutionOptions,
  DenoPermissions,
  ExecutionMetrics,
  RuntimeConfig,
} from '../types/index.js';
import { RuntimeError, SecurityError, ValidationError } from '../types/errors.js';

/**
 * Configuration for sandbox execution environment
 */
export interface SandboxConfig {
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Deno permissions */
  permissions: DenoPermissions;
  /** Allowed modules for import */
  allowedModules: string[];
  /** Working directory for execution */
  workingDir?: string;
  /** Whether to enable debugging */
  enableDebugging?: boolean;
}

/**
 * Secure TypeScript code executor using Deno sandbox
 */
export class DenoExecutor {
  private config: SandboxConfig;
  private tempDir: string | null = null;

  constructor(config: SandboxConfig) {
    this.config = { ...config };
  }

  /**
   * Execute TypeScript code string in sandbox
   */
  async execute(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let tempFile: string | null = null;

    try {
      // Create temporary file for code execution
      tempFile = await this.createTempFile(code);

      // Execute the temporary file
      const result = await this.executeFile(tempFile, options);
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof RuntimeError || error instanceof SecurityError || error instanceof ValidationError 
          ? error 
          : new RuntimeError(
              `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
              undefined,
              { originalError: error }
            ),
        metrics: {
          duration: Date.now() - startTime,
          memoryUsed: 0,
          apiCallCount: 0,
        },
      };
    } finally {
      // Clean up temporary file
      if (tempFile) {
        try {
          await unlink(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Execute TypeScript file in sandbox
   */
  async executeFile(
    filePath: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const effectiveConfig = this.mergeOptions(options);

    try {
      // Validate file path security
      this.validateFilePath(filePath);

      // Build Deno command arguments
      const args = this.buildDenoArgs(filePath, effectiveConfig);

      // Execute in subprocess with timeout and resource limits
      const result = await this.executeSubprocess(args, effectiveConfig);

      const duration = Date.now() - startTime;

      return {
        success: true,
        result: result.output,
        metrics: {
          duration,
          memoryUsed: result.memoryUsed,
          apiCallCount: result.apiCallCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof RuntimeError || error instanceof SecurityError || error instanceof ValidationError 
          ? error 
          : new RuntimeError(
              `File execution failed: ${error instanceof Error ? error.message : String(error)}`,
              undefined,
              { filePath, originalError: error }
            ),
        metrics: {
          duration: Date.now() - startTime,
          memoryUsed: 0,
          apiCallCount: 0,
        },
      };
    }
  }

  /**
   * Set sandbox permissions
   */
  setPermissions(permissions: DenoPermissions): void {
    this.config.permissions = { ...permissions };
  }

  /**
   * Update sandbox configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current sandbox configuration
   */
  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }

  /**
   * Create temporary file with TypeScript code
   */
  private async createTempFile(code: string): Promise<string> {
    if (!this.tempDir) {
      this.tempDir = await mkdtemp(join(tmpdir(), 'mcp-executor-'));
    }

    const tempFile = join(this.tempDir, `script-${Date.now()}.ts`);
    await writeFile(tempFile, code, 'utf8');
    return tempFile;
  }

  /**
   * Validate file path for security
   */
  private validateFilePath(filePath: string): void {
    // Prevent path traversal attacks
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new SecurityError(
        'Invalid file path: path traversal not allowed',
        'path_traversal',
        { filePath }
      );
    }

    // Ensure file is TypeScript
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
      throw new ValidationError(
        'Invalid file type: only TypeScript files are allowed',
        'filePath',
        { filePath }
      );
    }
  }

  /**
   * Merge execution options with sandbox config
   */
  private mergeOptions(options: ExecutionOptions): SandboxConfig {
    return {
      ...this.config,
      timeout: options.timeout ?? this.config.timeout,
      memoryLimit: options.memoryLimit ?? this.config.memoryLimit,
      permissions: options.permissions ?? this.config.permissions,
    };
  }

  /**
   * Build Deno command arguments with security restrictions
   */
  private buildDenoArgs(filePath: string, config: SandboxConfig): string[] {
    const args = ['run'];

    // Add permission flags
    const permissions = config.permissions;
    
    if (permissions.allowNet === true) {
      args.push('--allow-net');
    } else if (Array.isArray(permissions.allowNet)) {
      args.push(`--allow-net=${permissions.allowNet.join(',')}`);
    }

    if (permissions.allowRead === true) {
      args.push('--allow-read');
    } else if (Array.isArray(permissions.allowRead)) {
      args.push(`--allow-read=${permissions.allowRead.join(',')}`);
    }

    if (permissions.allowWrite === true) {
      args.push('--allow-write');
    } else if (Array.isArray(permissions.allowWrite)) {
      args.push(`--allow-write=${permissions.allowWrite.join(',')}`);
    }

    if (permissions.allowEnv === true) {
      args.push('--allow-env');
    } else if (Array.isArray(permissions.allowEnv)) {
      args.push(`--allow-env=${permissions.allowEnv.join(',')}`);
    }

    if (permissions.allowRun === true) {
      args.push('--allow-run');
    } else if (Array.isArray(permissions.allowRun)) {
      args.push(`--allow-run=${permissions.allowRun.join(',')}`);
    }

    if (permissions.allowHrtime) {
      args.push('--allow-hrtime');
    }

    // Add file path
    args.push(filePath);

    return args;
  }

  /**
   * Execute Deno subprocess with timeout and resource monitoring
   */
  private async executeSubprocess(
    args: string[],
    config: SandboxConfig
  ): Promise<{ output: unknown; memoryUsed: number; apiCallCount: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn('deno', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: config.workingDir,
      });

      let stdout = '';
      let stderr = '';
      let memoryUsed = 0;
      let apiCallCount = 0;

      // Set up timeout
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new RuntimeError(
          `Execution timed out after ${config.timeout}ms`,
          undefined,
          { timeout: config.timeout }
        ));
      }, config.timeout);

      // Collect output
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Monitor memory usage (simplified - in production would use more sophisticated monitoring)
      const memoryMonitor = setInterval(() => {
        if (child.pid) {
          try {
            // This is a simplified memory check - in production would use process monitoring
            memoryUsed = Math.max(memoryUsed, process.memoryUsage().heapUsed);
            
            if (memoryUsed > config.memoryLimit) {
              child.kill('SIGKILL');
              clearInterval(memoryMonitor);
              clearTimeout(timeout);
              reject(new RuntimeError(
                `Memory limit exceeded: ${memoryUsed} > ${config.memoryLimit}`,
                undefined,
                { memoryUsed, memoryLimit: config.memoryLimit }
              ));
            }
          } catch {
            // Ignore monitoring errors
          }
        }
      }, 100);

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        clearInterval(memoryMonitor);

        if (signal === 'SIGKILL') {
          reject(new RuntimeError(
            'Process was killed (timeout or resource limit)',
            undefined,
            { signal }
          ));
          return;
        }

        if (code !== 0) {
          reject(new RuntimeError(
            `Process exited with code ${code}: ${stderr}`,
            code ?? 500,
            { stderr }
          ));
          return;
        }

        try {
          // Try to parse output as JSON, fallback to string
          let output: unknown;
          try {
            output = JSON.parse(stdout.trim());
          } catch {
            output = stdout.trim();
          }

          // Count API calls from output (simplified heuristic)
          apiCallCount = (stdout.match(/api\s*call/gi) || []).length;

          resolve({
            output,
            memoryUsed,
            apiCallCount,
          });
        } catch (error) {
          reject(new RuntimeError(
            `Failed to process execution result: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { stdout, stderr, originalError: error }
          ));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        clearInterval(memoryMonitor);
        reject(new RuntimeError(
          `Failed to start Deno process: ${error.message}`,
          undefined,
          { originalError: error }
        ));
      });
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        // Clean up temporary directory
        const { rmdir } = await import('node:fs/promises');
        await rmdir(this.tempDir, { recursive: true });
        this.tempDir = null;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Create a DenoExecutor from RuntimeConfig
 */
export function createDenoExecutor(config: RuntimeConfig): DenoExecutor {
  const sandboxConfig: SandboxConfig = {
    timeout: config.timeout,
    memoryLimit: config.memoryLimit,
    permissions: config.permissions,
    allowedModules: config.allowedModules,
    ...(config.enableDebugging !== undefined && { enableDebugging: config.enableDebugging }),
  };

  return new DenoExecutor(sandboxConfig);
}