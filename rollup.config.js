import ts from "@rollup/plugin-typescript"
import { terser } from "@rollup/plugin-terser"

export default {
  input: "src/main/minio.ts",
  output: [
    {
      file: "dist/main/minio.cjs",
      format: "cjs",
      exports: "default"
    },
    {
      file: "dist/main/minio.mjs",
      format: "es"
    },
    {
      file: "dist/main/minio.iife.js",
      format: "iife",
      name: "MinIO",
      plugins: [terser()]
    }
  ],
  plugins: [ts({ tsconfig: "./tsconfig.json" })]
}