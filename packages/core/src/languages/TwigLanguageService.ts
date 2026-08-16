import { DEFAULT_COMMENT_SYNTAXES } from '../extractor.helper';
import { CommentSyntax } from '../LanguageService';
import { HtmlLanguageService } from './HtmlLanguageService';

export class TwigLanguageService extends HtmlLanguageService {
  languageIds = ['twig'];

  // `{# ... #}` stays scoped to twig: Svelte writes blocks as `{#if cond}`,
  // which would otherwise read as an unterminated comment
  public commentSyntaxes: Array<CommentSyntax> = [
    ...DEFAULT_COMMENT_SYNTAXES,
    { open: '{#', close: '#}' },
  ];
}
