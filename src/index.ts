import type ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

function init(modules: {
  typescript: typeof import('typescript/lib/tsserverlibrary');
}) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    const indexPattern = /index\.(ts|tsx|js|jsx)/;
    const indexRegexes: string[] = [
      'index.tsx',
      'index.ts',
      'index.js',
      'index.jsx',
    ];

    const proxy: ts.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<
      keyof ts.LanguageService
    >) {
      // biome-ignore lint/style/noNonNullAssertion:
      const x = info.languageService[k]!;
      // @ts-expect-error
      // biome-ignore lint/complexity/noBannedTypes:
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
    }

    proxy.getCompletionsAtPosition = (
      fileName,
      position,
      options,
      ...restArgs
    ) => {
      const original = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options,
        ...restArgs
      );
      if (!original) return;

      original.entries = original.entries.map((entry) => {
        const filePath = entry.data?.fileName;
        if (!filePath) return entry;
        if (!fs.existsSync(filePath)) return entry;

        // 해당 파일의 동일 경로에 index.ts, index.tsx, index.js, index.jsx가 있는지 확인한다.
        const dirPath = path.dirname(filePath);
        const indexFiles = indexRegexes.map((pattern) =>
          path.join(dirPath, pattern)
        );
        const indexFilePath = indexFiles.find((indexFile) =>
          fs.existsSync(indexFile)
        );
        if (!indexFilePath) return entry;

        // TODO: auto-import를 기존 path에서 index로 변경하는 로직 추가
        // data 속성을 이용하라고 되어있는데, 값 그대로 줘도 안됨

        return entry;
      });

      return original;
    };

    proxy.getCodeFixesAtPosition = (
      fileName: string,
      start: number,
      end: number,
      errorCodes: readonly number[],
      formatOptions: ts.FormatCodeSettings,
      preferences: ts.UserPreferences
    ) => {
      const original = info.languageService.getCodeFixesAtPosition(
        fileName,
        start,
        end,
        errorCodes,
        formatOptions,
        preferences
      );

      const newFixes = [...original].sort((a, b) => {
        const aSort = indexPattern.test(a.description) ? -1 : 0;
        const bSort = indexPattern.test(b.description) ? -1 : 0;

        return aSort - bSort;
      });

      return newFixes;
    };

    return proxy;
  }

  return { create };
}

export = init;
