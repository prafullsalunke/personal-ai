// MCP Server Configuration
export interface MCPServerConfig {
    // STDIO transport fields
    command?: string;
    args?: string[];
    env?: Record<string, string>;

    // SSE transport fields
    url?: string;
    headers?: Record<string, string>;

    transport?: 'stdio' | 'sse';
}

export interface MCPServersConfig {
    mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPServer {
    id: string;
    name: string;
    config: MCPServerConfig;
    enabled: boolean;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    tools?: MCPTool[];
    lastChecked?: Date;
}

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface MCPToolCall {
    toolName: string;
    arguments: Record<string, unknown>;
    serverId: string;
}

export interface MCPToolResult {
    success: boolean;
    toolName: string;
    result: unknown;
    timestamp: string;
    error?: string;
}
