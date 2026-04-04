declare module "monaco-editor" {
  const monaco: any;
  export = monaco;
}

declare module "monaco-editor/esm/vs/editor/editor.api" {
  const monaco: any;
  export = monaco;
}

declare module "monaco-editor/esm/*?worker" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module "monaco-editor/esm/*" {
  const value: any;
  export default value;
}
