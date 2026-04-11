import js from "@eslint/js";
import googleappsscript from "eslint-plugin-googleappsscript";

export default [
  js.configs.recommended,
  {
    files: ["**/*.gs", "**/*.js"],
    plugins: {
      googleappsscript,
    },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ...googleappsscript.environments.googleappsscript.globals,
      },
    },
    rules: {
      "no-extra-boolean-cast": "off",
      "no-unused-vars": "off",
    },
  },
];