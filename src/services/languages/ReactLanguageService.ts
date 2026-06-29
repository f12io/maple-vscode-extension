import { JSX_EXPR_START_REGEX } from '../../constants/regex';
import { extractStringsFromBraces } from '../../helpers/extractor.helper';
import { ClassInstance } from '../LanguageService';
import { JavascriptLanguageService } from './JavascriptLanguageService';

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
      JSX_EXPR_START_REGEX,
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
