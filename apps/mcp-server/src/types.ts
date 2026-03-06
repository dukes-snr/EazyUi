export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface EazyUiHtmlScreen {
  screenId: string;
  name: string;
  html: string;
  width?: number;
  height?: number;
  status?: 'streaming' | 'complete';
}

export interface EazyUiDesignSpec {
  id: string;
  name: string;
  description?: string;
  screens: EazyUiHtmlScreen[];
  designSystem?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EazyUiProjectPayload {
  projectId: string;
  designSpec: EazyUiDesignSpec;
  canvasDoc?: unknown;
  chatState?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequestContext {
  traceId: string;
  authorization?: string;
  uid?: string;
}
