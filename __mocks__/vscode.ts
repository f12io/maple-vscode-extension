export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
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
      this.end = new Position(endLine as number, endCharacter as number);
    }
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
    public items: CompletionItem[] = [],
    public isIncomplete: boolean = false,
  ) {}
}

export class MarkdownString {
  constructor(public value: string) {}
}

export class SemanticTokensLegend {
  constructor(
    public readonly tokenTypes: string[],
    public readonly tokenModifiers: string[],
  ) {}
}

export class SemanticTokensBuilder {
  private tokens: any[] = [];
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
  getWorkspaceFolder: () => ({ uri: { fsPath: "/test" } }),
};
