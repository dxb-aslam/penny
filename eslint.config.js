import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android', 'ios', 'server']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Utility modules (Icons, ui, AppContext) intentionally co-locate helpers
      // with components; this rule is a dev-only HMR nicety, not a correctness check.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Node proxy server
    files: ['server/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
