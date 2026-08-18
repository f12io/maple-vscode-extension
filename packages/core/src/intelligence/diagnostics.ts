import { buildRule } from '@f12io/maple';
import { MAPLE_CLASS_REGEX } from '../regex';
import { LanguageServiceRegistry } from '../registry';
import { collectAliasDefinitions } from './aliases';
import {
  checkConverted,
  isAliasDefinition,
  parseMapleToken,
  stripQuotes,
} from './maple-parser';
import type { IntelligenceContext } from './types';
import { validateClass, type MapleValidationCode } from './validate';

/**
 * Why a diagnostic was reported. Extends the per-class validation codes with
 * the one problem that only exists between classes.
 */
export type MapleDiagnosticCode =
  | MapleValidationCode
  /** Two classes on the same element resolve to the same declaration. */
  | 'conflicting-utility';

/** A document range, in offsets. */
export interface MapleDiagnosticSpan {
  start: number;
  end: number;
}

export interface MapleDiagnostic extends MapleDiagnosticSpan {
  code: MapleDiagnosticCode;
  /** Ready to show as-is. */
  message: string;
  /**
   * The class rewritten the way it was meant, when that is unambiguous —
   * suitable for a quick fix. Never set for `conflicting-utility`, where
   * which of the two classes to drop is the user's call.
   */
  fix?: string;
  /**
   * The other occurrences of the same problem, so hosts can link them.
   * Only set for `conflicting-utility`, which is reported on every
   * participant rather than on one of them.
   */
  related?: Array<MapleDiagnosticSpan>;
}

/** Razor variables and expressions are code, not classes the engine can judge. */
const RAZOR_LANGUAGE_IDS = new Set(['razor', 'aspnetcorerazor']);

/** Openers of a templating hole that can truncate the class before it. */
const EXPRESSION_OPENERS = ['${', '@(', '<?', '{'];

/** A closing quote followed by a concatenation operator: `' .`, `" +`, … */
const CONCATENATION_SEAM_REGEX = /^['"`]\s*[.+]/;

/**
 * Whether the text right after `instanceEnd` opens an expression, meaning the
 * class touching that edge is a fragment the user never finished typing —
 * `p-${size}` extracts as `p-`, which is not a typo worth reporting.
 */
function isCutOffByExpression(text: string, instanceEnd: number): boolean {
  const nextSlice = text.substring(instanceEnd, instanceEnd + 5).trim();

  return (
    EXPRESSION_OPENERS.some((opener) => nextSlice.startsWith(opener)) ||
    CONCATENATION_SEAM_REGEX.test(nextSlice)
  );
}

/**
 * A templating language's own expressions are not maple classes, and the
 * engine cannot tell them apart from a typo — so the generic unknown-class
 * fallback is suppressed for them. Every other code still applies.
 */
function isHostExpression(cls: string, languageId: string): boolean {
  if (!RAZOR_LANGUAGE_IDS.has(languageId)) return false;

  return cls.startsWith('@') || cls.includes('(') || cls.includes(')');
}

/** Occurrences of each conflict key within one conflict scope. */
type ConflictScope = Map<string, Array<MapleDiagnosticSpan>>;

/**
 * Emits a diagnostic on every participant of each conflict in `scope`, each
 * linking the others, and empties the scope. A key seen once is not a
 * conflict.
 */
function flushConflicts(
  scope: ConflictScope,
  out: Array<MapleDiagnostic>,
): void {
  for (const [conflictKey, spans] of scope) {
    if (spans.length < 2) continue;

    for (const span of spans) {
      out.push({
        start: span.start,
        end: span.end,
        code: 'conflicting-utility',
        message: `Conflicted utility usage: '${conflictKey}'`,
        related: spans.filter((other) => other !== span),
      });
    }
  }

  scope.clear();
}

/**
 * Every problem with the maple classes in `text`, in document order.
 *
 * This is the whole diagnostics story for a host: region discovery, word
 * splitting, quote stripping, the maple-intent gate, tag resolution, alias
 * collection, per-class validation and cross-class conflict detection all
 * happen here, so an editor adapter only maps offsets to its own ranges.
 *
 * Every diagnostic is a warning — maple never fails a build, so nothing here
 * is an error — and hosts that want to hide a category can filter on `code`.
 */
export function getDiagnostics(
  text: string,
  ctx: IntelligenceContext,
): Array<MapleDiagnostic> {
  const diagnostics: Array<MapleDiagnostic> = [];

  const languageService = LanguageServiceRegistry.getService(ctx.languageId);
  if (!languageService) return diagnostics;

  const localAliases = collectAliasDefinitions(text, ctx.localAliases);

  for (const instance of languageService.extractClasses(text)) {
    const classValue = instance.value;
    /** Utilities applied to this element: they conflict with each other. */
    const elementScope: ConflictScope = new Map();

    for (const token of languageService.tokenizeClassesWithIndices(
      classValue,
    )) {
      if (token.value.includes('${') || token.hasInterpolation) continue;

      // An alias definition (`--alias-name=u1;u2;u3`) is a single token, but
      // the class regex splits it on ';'. Those fragments are the alias body:
      // utilities that apply wherever the alias is used, not to this element.
      // So they get a conflict scope of their own — they must clash with each
      // other, but never with the element's classes or with another alias.
      const isAliasDefinitionToken = isAliasDefinition(
        stripQuotes(token.value).word,
      );
      const aliasBodyScope: ConflictScope = new Map();
      const scope = isAliasDefinitionToken ? aliasBodyScope : elementScope;

      for (const wordMatch of token.value.matchAll(MAPLE_CLASS_REGEX)) {
        const rawWord = wordMatch[0];

        const wordEndOffset = token.start + wordMatch.index + rawWord.length;
        if (
          wordEndOffset === classValue.length &&
          isCutOffByExpression(text, instance.end)
        ) {
          continue;
        }

        const stripped = stripQuotes(rawWord);
        const cls = stripped.word;
        if (cls.length === 0) continue;

        const { isMapleIntent } = parseMapleToken(cls);
        if (!isMapleIntent) continue;

        const start =
          instance.start + token.start + wordMatch.index + stripped.offset;
        const span: MapleDiagnosticSpan = { start, end: start + cls.length };

        const issue = validateClass(cls, {
          tagName: instance.tagName,
          localAliases,
        });

        if (
          issue &&
          !(
            issue.code === 'unknown-class' &&
            isHostExpression(cls, ctx.languageId)
          )
        ) {
          diagnostics.push({
            ...span,
            code: issue.code,
            message: issue.message,
            ...(issue.fix === undefined ? {} : { fix: issue.fix }),
          });
          continue;
        }

        // The class regex splits an alias definition on ';', which leaves the
        // first body utility glued to the `--alias-name=` declaration. Peel
        // the declaration off so that utility conflicts with the rest of the
        // body like any other member of it.
        const declarationLength =
          isAliasDefinitionToken && wordMatch.index === 0
            ? cls.indexOf('=') + 1
            : 0;

        const utility = cls.substring(declarationLength);
        if (utility.length === 0) continue;

        // Only a class the engine turns into CSS can clash with another one.
        if (!checkConverted(utility)) continue;

        const conflictKey = buildRule(utility)?.parsed?.conflictKey;
        if (!conflictKey) continue;

        const utilitySpan: MapleDiagnosticSpan = {
          start: span.start + declarationLength,
          end: span.end,
        };

        const occurrences = scope.get(conflictKey);
        if (occurrences) {
          occurrences.push(utilitySpan);
        } else {
          scope.set(conflictKey, [utilitySpan]);
        }
      }

      flushConflicts(aliasBodyScope, diagnostics);
    }

    flushConflicts(elementScope, diagnostics);
  }

  return diagnostics.sort((a, b) => a.start - b.start || a.end - b.end);
}
