export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}

  translate(lineDelta?: number, characterDelta?: number): Position {
    return new Position(
      this.line + (lineDelta || 0),
      this.character + (characterDelta || 0),
    );
  }

  with(line?: number, character?: number): Position {
    return new Position(
      line !== undefined ? line : this.line,
      character !== undefined ? character : this.character,
    );
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;
  constructor(
    startLine: number | Position,
    startCharacter: number | Position,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (startLine instanceof Position && startCharacter instanceof Position) {
      this.start = startLine;
      this.end = startCharacter;
    } else {
      this.start = new Position(startLine as number, startCharacter as number);
      this.end = new Position(endLine!, endCharacter!);
    }
  }

  with(start?: Position, end?: Position): Range {
    return new Range(
      start !== undefined ? start : this.start,
      end !== undefined ? end : this.end,
    );
  }
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24,
}

export class CompletionItem {
  public insertText?: string;
  public filterText?: string;
  public detail?: string;
  public documentation?: string | MarkdownString;
  public sortText?: string;
  public range?: Range;
  constructor(
    public label: string,
    public kind?: CompletionItemKind,
  ) {}
}

export class CompletionList {
  constructor(
    public items: Array<CompletionItem> = [],
    public isIncomplete = false,
  ) {}
}

export class MarkdownString {
  constructor(public value: string) {}
}

export class SemanticTokensLegend {
  constructor(
    public readonly tokenTypes: Array<string>,
    public readonly tokenModifiers: Array<string>,
  ) {}
}

export class SemanticTokensBuilder {
  private tokens: Array<any> = [];
  constructor(public legend?: SemanticTokensLegend) {}

  push(
    line: number,
    char: number,
    length: number,
    tokenType: number,
    tokenModifiers: number,
  ) {
    this.tokens.push({ line, char, length, tokenType, tokenModifiers });
  }

  build() {
    return { data: this.tokens }; // Mock representation
  }
}

export class SemanticTokens {
  constructor(public data: Uint32Array) {}
}

export const workspace = {
  getWorkspaceFolder: () => ({ uri: { fsPath: '/test' } }),
};

export class Color {
  constructor(
    public readonly red: number,
    public readonly green: number,
    public readonly blue: number,
    public readonly alpha: number,
  ) {}
}

export class ColorInformation {
  constructor(
    public readonly range: Range,
    public readonly color: Color,
  ) {}
}

export class EventEmitter<T> {
  event: any = () => ({ dispose: () => {} });
  fire(data?: T): void {}
  dispose(): void {}
}
