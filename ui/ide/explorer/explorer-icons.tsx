import { generateManifest } from "material-icon-theme";

import folderUrl from "material-icon-theme/icons/folder.svg?url";
import folderOpenUrl from "material-icon-theme/icons/folder-open.svg?url";
import folderSrcUrl from "material-icon-theme/icons/folder-src.svg?url";
import folderSrcOpenUrl from "material-icon-theme/icons/folder-src-open.svg?url";
import folderComponentsUrl from "material-icon-theme/icons/folder-components.svg?url";
import folderComponentsOpenUrl from "material-icon-theme/icons/folder-components-open.svg?url";
import folderUiUrl from "material-icon-theme/icons/folder-ui.svg?url";
import folderUiOpenUrl from "material-icon-theme/icons/folder-ui-open.svg?url";
import folderCoreUrl from "material-icon-theme/icons/folder-core.svg?url";
import folderCoreOpenUrl from "material-icon-theme/icons/folder-core-open.svg?url";
import folderDocsUrl from "material-icon-theme/icons/folder-docs.svg?url";
import folderDocsOpenUrl from "material-icon-theme/icons/folder-docs-open.svg?url";
import folderFeaturesUrl from "material-icon-theme/icons/folder-features.svg?url";
import folderFeaturesOpenUrl from "material-icon-theme/icons/folder-features-open.svg?url";
import folderScriptsUrl from "material-icon-theme/icons/folder-scripts.svg?url";
import folderScriptsOpenUrl from "material-icon-theme/icons/folder-scripts-open.svg?url";
import folderTestUrl from "material-icon-theme/icons/folder-test.svg?url";
import folderTestOpenUrl from "material-icon-theme/icons/folder-test-open.svg?url";
import folderNodeUrl from "material-icon-theme/icons/folder-node.svg?url";
import folderNodeOpenUrl from "material-icon-theme/icons/folder-node-open.svg?url";
import folderGitUrl from "material-icon-theme/icons/folder-git.svg?url";
import folderGitOpenUrl from "material-icon-theme/icons/folder-git-open.svg?url";
import folderTargetUrl from "material-icon-theme/icons/folder-target.svg?url";
import folderTargetOpenUrl from "material-icon-theme/icons/folder-target-open.svg?url";
import folderResourceUrl from "material-icon-theme/icons/folder-resource.svg?url";
import folderResourceOpenUrl from "material-icon-theme/icons/folder-resource-open.svg?url";
import folderCssUrl from "material-icon-theme/icons/folder-css.svg?url";
import folderCssOpenUrl from "material-icon-theme/icons/folder-css-open.svg?url";
import folderHookUrl from "material-icon-theme/icons/folder-hook.svg?url";
import folderHookOpenUrl from "material-icon-theme/icons/folder-hook-open.svg?url";

import fileUrl from "material-icon-theme/icons/file.svg?url";
import documentUrl from "material-icon-theme/icons/document.svg?url";
import readmeUrl from "material-icon-theme/icons/readme.svg?url";
import markdownUrl from "material-icon-theme/icons/markdown.svg?url";
import licenseUrl from "material-icon-theme/icons/license.svg?url";
import nodejsUrl from "material-icon-theme/icons/nodejs.svg?url";
import bunUrl from "material-icon-theme/icons/bun.svg?url";
import pnpmUrl from "material-icon-theme/icons/pnpm.svg?url";
import viteUrl from "material-icon-theme/icons/vite.svg?url";
import tsconfigUrl from "material-icon-theme/icons/tsconfig.svg?url";
import tuneUrl from "material-icon-theme/icons/tune.svg?url";
import dockerUrl from "material-icon-theme/icons/docker.svg?url";
import lockUrl from "material-icon-theme/icons/lock.svg?url";
import gitUrl from "material-icon-theme/icons/git.svg?url";
import makefileUrl from "material-icon-theme/icons/makefile.svg?url";
import eslintUrl from "material-icon-theme/icons/eslint.svg?url";
import biomeUrl from "material-icon-theme/icons/biome.svg?url";
import typescriptUrl from "material-icon-theme/icons/typescript.svg?url";
import typescriptDefUrl from "material-icon-theme/icons/typescript-def.svg?url";
import reactTsUrl from "material-icon-theme/icons/react_ts.svg?url";
import javascriptUrl from "material-icon-theme/icons/javascript.svg?url";
import reactUrl from "material-icon-theme/icons/react.svg?url";
import rustUrl from "material-icon-theme/icons/rust.svg?url";
import goUrl from "material-icon-theme/icons/go.svg?url";
import goModUrl from "material-icon-theme/icons/go-mod.svg?url";
import pythonUrl from "material-icon-theme/icons/python.svg?url";
import phpUrl from "material-icon-theme/icons/php.svg?url";
import javaUrl from "material-icon-theme/icons/java.svg?url";
import cUrl from "material-icon-theme/icons/c.svg?url";
import cppUrl from "material-icon-theme/icons/cpp.svg?url";
import vueUrl from "material-icon-theme/icons/vue.svg?url";
import jsonUrl from "material-icon-theme/icons/json.svg?url";
import tomlUrl from "material-icon-theme/icons/toml.svg?url";
import yamlUrl from "material-icon-theme/icons/yaml.svg?url";
import xmlUrl from "material-icon-theme/icons/xml.svg?url";
import htmlUrl from "material-icon-theme/icons/html.svg?url";
import cssUrl from "material-icon-theme/icons/css.svg?url";
import sassUrl from "material-icon-theme/icons/sass.svg?url";
import lessUrl from "material-icon-theme/icons/less.svg?url";
import imageUrl from "material-icon-theme/icons/image.svg?url";
import svgUrl from "material-icon-theme/icons/svg.svg?url";
import databaseUrl from "material-icon-theme/icons/database.svg?url";
import consoleUrl from "material-icon-theme/icons/console.svg?url";
import fontUrl from "material-icon-theme/icons/font.svg?url";
import settingsUrl from "material-icon-theme/icons/settings.svg?url";

const manifest = generateManifest({ activeIconPack: "angular" });
const fileNames = manifest.fileNames ?? {};
const fileExtensions = manifest.fileExtensions ?? {};
const folderNames = manifest.folderNames ?? {};
const folderNamesExpanded = manifest.folderNamesExpanded ?? {};
const rootFolderNames = manifest.rootFolderNames ?? {};
const rootFolderNamesExpanded = manifest.rootFolderNamesExpanded ?? {};

const iconUrls: Record<string, string> = {
  file: fileUrl,
  folder: folderUrl,
  "folder-open": folderOpenUrl,
  "folder-src": folderSrcUrl,
  "folder-src-open": folderSrcOpenUrl,
  "folder-components": folderComponentsUrl,
  "folder-components-open": folderComponentsOpenUrl,
  "folder-ui": folderUiUrl,
  "folder-ui-open": folderUiOpenUrl,
  "folder-core": folderCoreUrl,
  "folder-core-open": folderCoreOpenUrl,
  "folder-docs": folderDocsUrl,
  "folder-docs-open": folderDocsOpenUrl,
  "folder-features": folderFeaturesUrl,
  "folder-features-open": folderFeaturesOpenUrl,
  "folder-scripts": folderScriptsUrl,
  "folder-scripts-open": folderScriptsOpenUrl,
  "folder-test": folderTestUrl,
  "folder-test-open": folderTestOpenUrl,
  "folder-node": folderNodeUrl,
  "folder-node-open": folderNodeOpenUrl,
  "folder-git": folderGitUrl,
  "folder-git-open": folderGitOpenUrl,
  "folder-target": folderTargetUrl,
  "folder-target-open": folderTargetOpenUrl,
  "folder-resource": folderResourceUrl,
  "folder-resource-open": folderResourceOpenUrl,
  "folder-css": folderCssUrl,
  "folder-css-open": folderCssOpenUrl,
  "folder-hook": folderHookUrl,
  "folder-hook-open": folderHookOpenUrl,
  document: documentUrl,
  readme: readmeUrl,
  markdown: markdownUrl,
  license: licenseUrl,
  nodejs: nodejsUrl,
  bun: bunUrl,
  pnpm: pnpmUrl,
  vite: viteUrl,
  tsconfig: tsconfigUrl,
  tune: tuneUrl,
  docker: dockerUrl,
  lock: lockUrl,
  git: gitUrl,
  makefile: makefileUrl,
  eslint: eslintUrl,
  biome: biomeUrl,
  typescript: typescriptUrl,
  "typescript-def": typescriptDefUrl,
  react_ts: reactTsUrl,
  javascript: javascriptUrl,
  react: reactUrl,
  rust: rustUrl,
  go: goUrl,
  "go-mod": goModUrl,
  python: pythonUrl,
  php: phpUrl,
  java: javaUrl,
  c: cUrl,
  cpp: cppUrl,
  vue: vueUrl,
  json: jsonUrl,
  toml: tomlUrl,
  yaml: yamlUrl,
  xml: xmlUrl,
  html: htmlUrl,
  css: cssUrl,
  sass: sassUrl,
  less: lessUrl,
  image: imageUrl,
  svg: svgUrl,
  database: databaseUrl,
  console: consoleUrl,
  font: fontUrl,
  settings: settingsUrl,
};

function fileIconName(name: string): string {
  const lower = name.toLowerCase();
  const parts = lower.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";

  if (lower === ".env" || lower.startsWith(".env.")) return "tune";
  if (lower === "cargo.toml") return "rust";
  if (lower === "cargo.lock") return "lock";
  if (lower === "makefile" || lower === "gnumakefile") return "makefile";
  if (ext === "txt" || ext === "text" || ext === "log") return "font";

  const byName = fileNames[lower];
  if (byName) return byName;

  for (let i = 1; i < parts.length; i += 1) {
    const compoundExt = parts.slice(i).join(".");
    const match = fileExtensions[compoundExt];
    if (match) return match;
  }

  if (ext === "ts" || ext === "mts" || ext === "cts") return "typescript";
  if (ext === "tsx") return "react_ts";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "jsx") return "react";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "yaml" || ext === "yml") return "yaml";
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "toml") return "toml";
  if (ext === "json" || ext === "jsonc" || ext === "json5") return "json";
  return fileExtensions[ext] ?? "file";
}

function folderIconName(name: string, expanded: boolean): string {
  const lower = name.toLowerCase();
  const themed = expanded
    ? (folderNamesExpanded[lower] ?? rootFolderNamesExpanded[lower])
    : (folderNames[lower] ?? rootFolderNames[lower]);

  if (themed) return themed;
  return expanded ? "folder-open" : "folder";
}

export function explorerIconSrc(name: string, isDir: boolean, expanded = false): string {
  const iconName = isDir ? folderIconName(name, expanded) : fileIconName(name);
  if (iconUrls[iconName]) return iconUrls[iconName];

  if (!isDir) {
    const lower = name.toLowerCase();
    const ext = lower.includes(".") ? (lower.split(".").pop() ?? "") : "";
    if (ext === "json" || ext === "jsonc" || ext === "json5") return jsonUrl;
    if (ext === "html" || ext === "htm") return htmlUrl;
    if (ext === "md" || ext === "mdx") return markdownUrl;
    if (ext === "yml" || ext === "yaml") return yamlUrl;
    if (ext === "toml") return tomlUrl;
  }

  return isDir ? (expanded ? folderOpenUrl : folderUrl) : fileUrl;
}

export function ExplorerIcon({
  name,
  isDir,
  expanded = false,
}: {
  name: string;
  isDir: boolean;
  expanded?: boolean;
}) {
  const src = explorerIconSrc(name, isDir, expanded);
  return (
    <img className="file-tree__icon-image" src={src} alt="" aria-hidden="true" draggable={false} />
  );
}
