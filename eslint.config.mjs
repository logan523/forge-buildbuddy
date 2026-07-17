import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // react-three-fiber is imperatively mutative by design: scenes are driven by
    // mutating hook-returned objects (camera.position, gl.toneMapping, ref'd
    // Object3Ds) inside effects/frames. Next 16's React-Compiler-era hook rules
    // flag that idiom wholesale, so they're scoped OFF for the 3D stage tree
    // only — everywhere else in the app they stay meaningful and ON.
    files: ["src/components/stage/**", "src/app/dev/stage/**"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
