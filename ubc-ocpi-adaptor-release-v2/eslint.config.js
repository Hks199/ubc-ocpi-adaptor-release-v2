const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
            },
            globals: {
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: Object.assign(
            {},
            tseslint.configs.recommended.rules,
            {
                'brace-style': ['error', 'stroustrup', { allowSingleLine: false }],
                '@typescript-eslint/no-explicit-any': 'off',
            }
        ),
    },
    {
        ignores: ['node_modules/**', 'dist/**', 'coverage/**', '*.config.js'],
    },
];

