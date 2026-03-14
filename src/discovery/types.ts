/**
 * Discovery Document 类型定义
 * 与服务端 biz/discovery/registry.go 中的结构对应
 */

export interface DiscoveryDocument {
  name: string;
  version: string;
  title: string;
  description: string;
  baseUrl: string;
  resources: Record<string, Resource>;
}

export interface Resource {
  description?: string;
  methods: Record<string, Method>;
}

export interface Method {
  id: string;
  description: string;
  httpMethod: string;
  path: string;
  request?: Schema;
  response?: Schema;
  parameters?: Param[];
}

export interface Param {
  name: string;
  location: string; // "path" | "query" | "header" | "body"
  type: string;
  required: boolean;
  description: string;
}

export interface Schema {
  type: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: string[];
  format?: string;
  additionalProperties?: Schema;
}
