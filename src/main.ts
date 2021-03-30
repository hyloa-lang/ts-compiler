/*
  Entry point of the interpreter.
  
  Path conventions: abso
*/
import { promises } from 'fs';
import * as Path from 'path';

import { Module, ModuleSymbols } from './module.js';
import { ChalkScriptModule, ChalkDocModule } from './ast/index.js';
import { Class } from './typeUtils.js';

const libPattern = /^([a-zA-Z][a-zA-Z0-9\-]*)(?:@(\d+.\d+.\d+))?$/;

const extToSymbol: { [key: string]: Class<ModuleSymbols> } =
  { ".chs": ChalkScriptModule,
    ".chdoc": ChalkDocModule,
  };
  
// Morally only includes the possible output of `ModulePath.toString`;
type ModulePathString = string;

export class ModulePath {
  // Normalized to absolute path with root of project / library as root folder.
  path: string;
  library: string | null;
  version: string | null;
  
  constructor(library: string | null, version: string | null, path: string) {
    [ this.library, this.version, this.path ] = [ library, version, path ];
  }
  
  libraryAndVersion(): string {
    return this.library === null ? '' : this.library + '@' + this.version;
  }
  
  fsRoot(root: string): string {
    return root + this.libraryAndVersion();
  }
  
  fsPath(root: string): ModulePathString {
    return this.fsRoot(root) + this.path;
  }
};

// Intentionally NOT a subtype of `Error`. Unlike `Error`, this class does
// not represent a programmer error and thus does not need a stack thrace.
class CompileError {
  constructor(public message: string, public info?: object) {}
}

type ProjectSettings = {
  dependencies: Record<string, DependencySettings | undefined>;
};

type DependencySettings = {
  name: string;
  versions: string[];
  defaultVersion: string | null;
};

async function tryCatchFuckYou<T>(fn: () => Promise<T>): Promise<T|Error> {
  try { return await fn(); } catch (err) { return err; }
}

function throwImport(importing: ModulePath, path: string, reason: string): never {
  throw new CompileError(
      `Cannot import path: "${path}".\n`
    + `Imported from: "${importing.path}"\n`
    + (importing.library ? `In library: "${importing.library}"\n` : '')
    + '\n'
    + reason,
  );
}

function validateProjectSettings(settings: any): ProjectSettings {
  if (!('dependencies' in settings || !Array.isArray(settings.dependencies))) {
    throw new CompileError("TODO dependency settings missing or not array");
  }
  
  for (let dependency of (Object.values(settings.dependencies)) as any) {
    if (
      !dependency
        || typeof dependency !== 'object'
        || typeof dependency.name !== 'string'
        || !Array.isArray(dependency.versions)
        || dependency.versions.length === 0
        || typeof dependency.defaultVersion !== 'string' && dependency.defaultVersion !== null
    ) {
      throw new CompileError('TODO invalid dependency', dependency);
    }
  }
  
  return settings;
}

// Library is the empty string or "name@version".
async function loadSettings(projectRoot: string, library: string): Promise<ProjectSettings> {
  const path = Path.join(projectRoot, library + '/settings.json');
  
  const file = await tryCatchFuckYou(() => promises.readFile(path, 'utf8'));
  
  if (file instanceof Error) {
    console.log(`Note: Cannot load settings from "${path}".`
      + 'It will not be possible to import libraries. Reasonable defaults will '
      + 'be attempted to be used.');
    
    return { dependencies: {} }; // Hehe.
  }
  
  const json = JSON.parse(file);
  
  if (json === null) {
    if (library === '') {
      throw new CompileError('Cannot parse settings (`/settings.json`).');
    } else {
      throw new CompileError(`Cannot parse settings of "library ${library}".`);
    }
  }
  
  return validateProjectSettings(json);
}

// A normalized path is an absolute path (relative to the root folder of the
// project, or library it was imported from). Eg. if the root folder is
// `"/home/user/projects/asdf/"`,  `"/src/foo.chs"` represents
// `"/home/user/projects/asdf/src/foo.chs"` if it was  imported from the project
// itself, or `"/home/user/projects/asdf/lib/foo@0.4.7/src/foo.chs"` if imported
// from  the library `foo` at version `0.4.7`.
function normalizePath(
  libraries: Record<string, DependencySettings | undefined>,
  importing: ModulePath,
  imported: string,
): ModulePath {
  if (imported.startsWith('/')) return new ModulePath(importing.library, importing.version, imported);
  
  if (imported.startsWith('.')) {
    const importedPath = Path.join(Path.dirname(importing.path), imported);
    
    if (importedPath === Path.join('/a', Path.dirname(importing.path), imported)) {
      throwImport(importing, imported, 'Path is outside the root folder.');
    }
    
    return new ModulePath(importing.library, importing.version, importedPath);
  }
  
  if (imported.includes('/')) throwImport(importing, imported,
    'Cannot import internal files of libraries.');
  
  const lib = libraries[imported];
  
  if (lib === undefined) {
    throwImport(importing, imported, `Library not found / installed: ${imported}.`)
  }
  
  let [ library = null, version = null ] = libPattern.exec(imported) || [];
  
  if (!library) {
    throwImport(importing, imported, 'Library import has incorrect format.');
  }
  
  return new ModulePath(library, version, '/export.chs');
}

class Main {
  settings: Map<string | null, ProjectSettings> = new Map();
  modules: Map<ModulePathString, Module> = new Map();
  
  loadingModules = new Map<string, Promise<unknown>>();
  loadingSettings = new Map<string, Promise<unknown>>();
  
  projectRoot: string;
  
  constructor({ mainPath, projectRoot }: { mainPath: string, projectRoot: string }) {
    this.projectRoot = projectRoot;
    
    /*nowait*/ this.run(mainPath).catch(err => {
      err instanceof CompileError && console.log(err.message, err.info);
    });
  }
  
  async run(mainPath: string) {
    this.settings.set(null, await loadSettings(this.projectRoot, ''));
    
    await this.loadModule(new ModulePath(null, null, '/'), mainPath);
    
    // TODO run
  }
  
  async loadModule(importing: ModulePath, importedPath: string) {
    const modulePath = normalizePath(
      this.settings.get(importing.library)!.dependencies,
      importing,
      importedPath,
    );
    
    const ext = Path.extname(importedPath);
    
    if (!extToSymbol[ext]) throw new Error("Unknown extension \"" + ext + "\" of file: "
      + importedPath);
    
    if (this.loadingModules.has(importedPath)) return this.loadingModules.get(importedPath);
    
    const moduleFile = promises.readFile(modulePath.fsPath(this.projectRoot), "utf8");
    
    this.loadingModules.set(importedPath, moduleFile);
    
    if (!this.settings.has(modulePath.library)) {
      if (this.loadingSettings.has(modulePath.library!)) {
        await this.loadingSettings.get(modulePath.library!);
      } else {
        const settingsPromise = loadSettings(this.projectRoot, modulePath.library!);
        
        this.loadingSettings.set(modulePath.library!, settingsPromise);
        
        this.settings.set(modulePath.library!, await settingsPromise);
      }
    }
    
    const module = new Module(await moduleFile, extToSymbol[ext]);
    
    this.modules.set(modulePath.path, module);
    
    await Promise.all([ ...module.importPaths ].map(
      importedPath => this.loadModule(modulePath, importedPath),
    ));
  }
}

if (3 <= process.argv.length && process.argv.length < 5) {
  new Main({ projectRoot: process.argv[2], mainPath: process.argv[3] || '/main.chs' });
} else {
  console.log("Usage: `node main.mjs rootDirPath, ?mainModulePath = '/main.chs'`");
}
