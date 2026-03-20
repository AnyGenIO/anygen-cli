/**
 * Discovery Document type definitions
 * Aligned with GWS Discovery format + AnyGen extensions
 */

export interface DiscoveryDocument {
  name: string;
  version: string;
  title: string;
  description: string;
  baseUrl: string;
  schemas?: Record<string, Schema>;
  parameters?: Record<string, Param>;
  resources: Record<string, Resource>;
}

export interface Resource {
  description?: string;
  methods?: Record<string, Method>;
  resources?: Record<string, Resource>;
}

export interface Method {
  id: string;
  description: string;
  httpMethod: string;
  path: string;
  request?: Schema;
  response?: Schema;
  parameters?: Record<string, Param>;
  /** Whether this method supports --wait polling (declared in Discovery Document) */
  supportsPolling?: boolean;
}

export interface Param {
  type: string;
  location: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  description?: string;
}

export interface Schema {
  id?: string;
  type?: string;
  $ref?: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: boolean;
  enum?: string[];
  format?: string;
  additionalProperties?: Schema;
}
