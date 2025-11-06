/**
 * MCP Registry for managing multiple server connections and schema aggregation
 */

import { MCPClient } from './client.js';
import { ConnectionError, SchemaError } from '../types/errors.js';
import type { MCPServerConfig, MCPServerInfo, ToolSchema } from '../types/index.js';

/**
 * Event emitted when a server connection status changes
 */
export interface ConnectionEvent {
  serverId: string;
  connected: boolean;
  error?: Error;
}

/**
 * Registry for managing multiple MCP server connections
 */
export class MCPRegistry {
  private clients = new Map<string, MCPClient>();
  private serverConfigs = new Map<string, MCPServerConfig>();
  private toolSchemas = new Map<string, ToolSchema>();
  private connectionListeners: Array<(event: ConnectionEvent) => void> = [];

  /**
   * Add a server configuration to the registry
   */
  addServer(config: MCPServerConfig): void {
    if (this.serverConfigs.has(config.id)) {
      throw new ConnectionError(
        `Server with ID ${config.id} already exists in registry`,
        config.id
      );
    }

    this.serverConfigs.set(config.id, config);
    
    const client = new MCPClient(
      config.id,
      config.url,
      config.timeout,
      config.retries
    );
    
    this.clients.set(config.id, client);
  }

  /**
   * Remove a server from the registry
   */
  async removeServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        if (client.isConnected()) {
          await client.disconnect();
        }
      } catch (error) {
        // Log but don't throw - we want to remove the server regardless
        console.warn(`Error disconnecting from server ${serverId}:`, error);
      }
      
      this.clients.delete(serverId);
    }
    
    this.serverConfigs.delete(serverId);
    
    // Remove tool schemas from this server
    for (const [key, schema] of this.toolSchemas.entries()) {
      if (schema.serverId === serverId) {
        this.toolSchemas.delete(key);
      }
    }
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<void> {
    const connectionPromises = Array.from(this.clients.entries()).map(
      async ([serverId, client]) => {
        try {
          await client.connect();
          await this.loadToolSchemas(serverId);
          this.emitConnectionEvent({ serverId, connected: true });
        } catch (error) {
          this.emitConnectionEvent({ 
            serverId, 
            connected: false, 
            error: error instanceof Error ? error : new Error(String(error))
          });
          throw error;
        }
      }
    );

    const results = await Promise.allSettled(connectionPromises);
    
    // Check if any connections failed
    const failures = results
      .map((result, index) => ({ result, serverId: Array.from(this.clients.keys())[index] }))
      .filter(({ result }) => result.status === 'rejected');

    if (failures.length > 0) {
      const failedServerIds = failures.map(({ serverId }) => serverId);
      throw new ConnectionError(
        `Failed to connect to servers: ${failedServerIds.join(', ')}`,
        undefined,
        { failedServers: failedServerIds }
      );
    }
  }

  /**
   * Connect to a specific server
   */
  async connect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new ConnectionError(
        `Server ${serverId} not found in registry`,
        serverId
      );
    }

    try {
      await client.connect();
      await this.loadToolSchemas(serverId);
      this.emitConnectionEvent({ serverId, connected: true });
    } catch (error) {
      this.emitConnectionEvent({ 
        serverId, 
        connected: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectionPromises = Array.from(this.clients.entries()).map(
      async ([serverId, client]) => {
        try {
          if (client.isConnected()) {
            await client.disconnect();
          }
          this.emitConnectionEvent({ serverId, connected: false });
        } catch (error) {
          console.warn(`Error disconnecting from server ${serverId}:`, error);
        }
      }
    );

    await Promise.allSettled(disconnectionPromises);
    this.toolSchemas.clear();
  }

  /**
   * Disconnect from a specific server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new ConnectionError(
        `Server ${serverId} not found in registry`,
        serverId
      );
    }

    try {
      if (client.isConnected()) {
        await client.disconnect();
      }
      
      // Remove tool schemas from this server
      for (const [key, schema] of this.toolSchemas.entries()) {
        if (schema.serverId === serverId) {
          this.toolSchemas.delete(key);
        }
      }
      
      this.emitConnectionEvent({ serverId, connected: false });
    } catch (error) {
      this.emitConnectionEvent({ 
        serverId, 
        connected: false, 
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }

  /**
   * Get information about all connected servers
   */
  async getConnectedServers(): Promise<MCPServerInfo[]> {
    const serverInfoPromises = Array.from(this.clients.entries())
      .filter(([, client]) => client.isConnected())
      .map(async ([serverId, client]) => {
        try {
          return await client.getServerInfo();
        } catch (error) {
          // Return basic info if we can't get detailed info
          const config = this.serverConfigs.get(serverId);
          return {
            id: serverId,
            url: config?.url || '',
            connected: client.isConnected(),
            name: config?.name || serverId
          };
        }
      });

    return Promise.all(serverInfoPromises);
  }

  /**
   * Get all tool schemas from all connected servers
   */
  getToolSchemas(): Map<string, ToolSchema> {
    return new Map(this.toolSchemas);
  }

  /**
   * Get tool schemas for a specific server
   */
  getToolSchemasForServer(serverId: string): ToolSchema[] {
    return Array.from(this.toolSchemas.values())
      .filter(schema => schema.serverId === serverId);
  }

  /**
   * Get a specific tool schema by name
   * If multiple servers have tools with the same name, returns the first one found
   */
  getToolSchema(toolName: string): ToolSchema | undefined {
    return this.toolSchemas.get(toolName);
  }

  /**
   * Call a tool on the appropriate server
   */
  async callTool(toolName: string, args: unknown): Promise<unknown> {
    const schema = this.toolSchemas.get(toolName);
    if (!schema) {
      throw new SchemaError(
        `Tool ${toolName} not found in any connected server`,
        undefined,
        { toolName }
      );
    }

    const client = this.clients.get(schema.serverId);
    if (!client) {
      throw new ConnectionError(
        `Server ${schema.serverId} not found in registry`,
        schema.serverId,
        { toolName }
      );
    }

    if (!client.isConnected()) {
      throw new ConnectionError(
        `Server ${schema.serverId} is not connected`,
        schema.serverId,
        { toolName }
      );
    }

    return client.callTool(toolName, args);
  }

  /**
   * Check if a server is connected
   */
  isServerConnected(serverId: string): boolean {
    const client = this.clients.get(serverId);
    return client ? client.isConnected() : false;
  }

  /**
   * Get the list of configured server IDs
   */
  getServerIds(): string[] {
    return Array.from(this.serverConfigs.keys());
  }

  /**
   * Add a connection event listener
   */
  onConnectionChange(listener: (event: ConnectionEvent) => void): void {
    this.connectionListeners.push(listener);
  }

  /**
   * Remove a connection event listener
   */
  removeConnectionListener(listener: (event: ConnectionEvent) => void): void {
    const index = this.connectionListeners.indexOf(listener);
    if (index >= 0) {
      this.connectionListeners.splice(index, 1);
    }
  }

  /**
   * Load tool schemas from a specific server
   */
  private async loadToolSchemas(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client || !client.isConnected()) {
      return;
    }

    try {
      const schemas = await client.listTools();
      
      // Remove existing schemas for this server
      for (const [key, schema] of this.toolSchemas.entries()) {
        if (schema.serverId === serverId) {
          this.toolSchemas.delete(key);
        }
      }
      
      // Add new schemas, handling name conflicts
      for (const schema of schemas) {
        const key = this.resolveToolName(schema.name, schema.serverId);
        this.toolSchemas.set(key, { ...schema, name: key });
      }
    } catch (error) {
      throw new SchemaError(
        `Failed to load tool schemas from server ${serverId}`,
        undefined,
        { serverId },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Resolve tool name conflicts by adding server prefix if necessary
   */
  private resolveToolName(toolName: string, serverId: string): string {
    // Check if this tool name already exists from a different server
    const existingSchema = this.toolSchemas.get(toolName);
    if (existingSchema && existingSchema.serverId !== serverId) {
      // Name conflict - use server-prefixed name
      return `${serverId}.${toolName}`;
    }
    
    return toolName;
  }

  /**
   * Emit a connection event to all listeners
   */
  private emitConnectionEvent(event: ConnectionEvent): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in connection event listener:', error);
      }
    }
  }
}