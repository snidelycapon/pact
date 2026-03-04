import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** Extension host bundle (Node.js, CommonJS for VSCode) */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !isWatch,
};

/** Webview bundle (browser, ESM) */
const webviewConfig = {
  entryPoints: ["webview/components/index.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionConfig);
  const webCtx = await esbuild.context(webviewConfig);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
  console.log("Build complete.");
}
