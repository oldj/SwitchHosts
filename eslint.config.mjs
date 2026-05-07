import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'build-tauri/**',
      'node_modules/**',
      'src-tauri/**',
      'src/version.json',
      'src/renderer/.umi*/**',
      'scripts/**',
      'alfred/**',
      '**/*.scss',
      '**/*.module.scss',
      'test/tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        // 数据契约保护：interface property、对象字面量 property 不约束格式
        // (IPC 字符串、磁盘 schema、i18n key、与 Rust 后端对齐的配置字段)
        {
          selector: 'property',
          format: null,
        },
        {
          selector: 'import',
          format: null,
        },
        {
          selector: 'objectLiteralProperty',
          format: null,
        },
        {
          selector: 'typeProperty',
          format: null,
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
)
