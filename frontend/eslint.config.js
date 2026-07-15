import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = 빌드 산출물, *.generated.ts = 스크립트 생성물(gen-release-notes 등) — 린트 대상 아님.
  globalIgnores(['dist', 'src/**/*.generated.ts']),
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
      // _ 접두 = 의도적으로 버리는 변수/인자/catch 바인딩 (구조분해 나머지 등) 허용.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // 마운트 시 데이터 fetch → setState 는 이 앱의 표준 패턴(10개 페이지). react-hooks v7
      // 신규 규칙이 false-positive 를 다발로 내므로 끈다. (정공법은 react-query 도입이나 단독 도구엔 과함)
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
