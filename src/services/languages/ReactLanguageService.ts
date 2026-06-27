import { getJsxExprStartRegex } from '../../constants/regex';
import { ClassInstance } from '../LanguageService';
import { JavascriptLanguageService } from './JavascriptLanguageService';
import { extractStringsFromBraces } from './extractor-utils';

export class ReactLanguageService extends JavascriptLanguageService {
  languageIds = ['javascriptreact', 'typescriptreact'];

  protected extractFrameworkSpecificClasses(
    text: string,
    instances: Array<ClassInstance>,
    disabledBlocks: Array<{ start: number; end: number }>,
  ): void {
    // React / Solid JSX expressions: className={...}, class={...}, classList={...}
    extractStringsFromBraces(
      text,
      getJsxExprStartRegex(),
      '{',
      '}',
      instances,
      disabledBlocks,
      (val: string, off: number, txt: string, idx: number) =>
        this.extractAttributeClasses(
          val,
          off,
          txt,
          idx,
          instances,
          disabledBlocks,
        ),
    );

    super.extractFrameworkSpecificClasses(text, instances, disabledBlocks);
  }
}
