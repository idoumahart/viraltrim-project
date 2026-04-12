],
      'import/named': 'error',
      'import/default': 'error',
      'import/no-unresolved': ['error', { 
        ignore: ['cloudflare:workers', 'agents'] 
      }],

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import': importPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'prefer-const': 'off',
      "react-hooks/rules-of-hooks": "error", 
      "react-hooks/exhaustive-deps": "error",
      '@typescript-eslint/no-unused-vars': "off",
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },