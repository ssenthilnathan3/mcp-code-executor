/**
 * MCP Client wrapper providing enhanced functionality over the base SDK
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequest, CallToolResult, ListToolsRequest, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { ConnectionError, SchemaError } from '../types/errors.js';
import type { ToolSchema, MCPServerInfo, JSONSchema } from '../types/index.js';

/**
 * Enhanced MCP client that wraps the base SDK with additional functionality
 */
export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelay = 1000; // 1 second

  constructor(
    private readonly serverId: string,
    private readonly serverUrl: string,
    private readonly timeout = 30000,
    private readonly retries = 3
  ) {
    // For now, we'll use stdio transport - in a real implementation,
    // this would be configurable based on the server URL
    this.transport = new StdioClientTransport({
      command: serverUrl, // Assuming serverUrl is a command for stdio transport
      args: []
    });
    
    this.client = new Client({
      name: `mcp-code-executor-${serverId}`,
      version: '0.1.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect(this.transport);
      this.connected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      throw new ConnectionError(
        `Failed to connect to MCP server ${this.serverId}`,
        this.serverId,
        { serverUrl: this.serverUrl },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connected) {
        await this.client.close();
        this.connected = false;
      }
    } catch (error) {
      throw new ConnectionError(
        `Failed to disconnect from MCP server ${this.serverId}`,
        this.serverId,
        { serverUrl: this.serverUrl },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<MCPServerInfo> {
    if (!this.connected) {
      throw new ConnectionError(
        `Cannot get server info: not connected to ${this.serverId}`,
        this.serverId
      );
    }

    try {
      // In a real implementation, this would call the server's info endpoint
      // For now, we'll return basic info
      return {
        id: this.serverId,
        url: this.serverUrl,
        connected: this.connected,
        name: this.serverId,
        version: '1.0.0'
      };
    } catch (error) {
      throw new ConnectionError(
        `Failed to get server info from ${this.serverId}`,
        this.serverId,
        {},
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * List all available tools from the server
   */
  async listTools(): Promise<ToolSchema[]> {
    if (!this.connected) {
      throw new ConnectionError(
        `Cannot list tools: not connected to ${this.serverId}`,
        this.serverId
      );
    }

    try {
      const request: ListToolsRequest = {
        method: 'tools/list',
        params: {}
      };

      const response = await this.client.request(request, {} as any) as ListToolsResult;
      
      return response.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as JSONSchema,
        serverId: this.serverId
      }));
    } catch (error) {
      throw new SchemaError(
        `Failed to list tools from server ${this.serverId}`,
        undefined,
        { serverId: this.serverId },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Call a specific tool on the server
   */
  async callTool(toolName: string, args: unknown): Promise<unknown> {
    if (!this.connected) {
      await this.reconnect();
    }

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const request: CallToolRequest = {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: (args as Record<string, unknown>) || {}
          }
        };

        const response = await this.client.request(request, {} as any) as CallToolResult;
        return response.content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retries - 1) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          
          // Try to reconnect if connection was lost
          if (!this.connected) {
            try {
              await this.reconnect();
            } catch (reconnectError) {
              // Continue with the retry loop
            }
          }
        }
      }
    }

    throw new ConnectionError(
      `Failed to call tool ${toolName} on server ${this.serverId} after ${this.retries} attempts`,
      this.serverId,
      { toolName, args },
      lastError
    );
  }

  /**
   * Attempt to reconnect to the server
   */
  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new ConnectionError(
        `Max reconnection attempts (${this.maxReconnectAttempts}) exceeded for server ${this.serverId}`,
        this.serverId
      );
    }

    this.reconnectAttempts++;
    
    try {
      // Close existing connection if any
      if (this.connected) {
        await this.disconnect();
      }

      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));
      
      // Attempt to reconnect
      await this.connect();
    } catch (error) {
      throw new ConnectionError(
        `Reconnection attempt ${this.reconnectAttempts} failed for server ${this.serverId}`,
        this.serverId,
        { attempt: this.reconnectAttempts },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the server ID
   */
  getServerId(): string {
    return this.serverId;
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }
}