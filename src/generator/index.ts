/**
 * Generator module - TypeScript code generation from JSON Schema
 */

export { TypeMapper, type TypeMapperOptions } from './type-mapper.js';
export { 
  NamespaceManager, 
  type NamespaceManagerOptions, 
  type NamespaceConflict 
} from './namespace-manager.js';
export { 
  TemplateBuilder, 
  type TemplateBuilderOptions 
} from './template-builder.js';
export { 
  TypeScriptGenerator, 
  type TypeScriptGeneratorOptions,
  type GeneratedFile
} from './typescript-generator.js';