import * as prettier from 'prettier';

export async function generateCSSMarkdownString(css: string) {
  return await prettier.format(css, {
    parser: 'css',
    printWidth: 80, // Forces Prettier to start wrapping early
    tabWidth: 2,
    useTabs: false,
  });
}
