'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SemanticTokens =
  exports.SemanticTokensBuilder =
  exports.SemanticTokensLegend =
  exports.MarkdownString =
  exports.CompletionList =
  exports.CompletionItem =
  exports.CompletionItemKind =
  exports.Range =
  exports.Position =
    void 0;
class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
exports.Position = Position;
class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    if (startLine instanceof Position && startCharacter instanceof Position) {
      this.start = startLine;
      this.end = startCharacter;
    } else {
      this.start = new Position(startLine, startCharacter);
      this.end = new Position(endLine, endCharacter);
    }
  }
}
exports.Range = Range;
var CompletionItemKind;
(function (CompletionItemKind) {
  CompletionItemKind[(CompletionItemKind['Text'] = 0)] = 'Text';
  CompletionItemKind[(CompletionItemKind['Method'] = 1)] = 'Method';
  CompletionItemKind[(CompletionItemKind['Function'] = 2)] = 'Function';
  CompletionItemKind[(CompletionItemKind['Constructor'] = 3)] = 'Constructor';
  CompletionItemKind[(CompletionItemKind['Field'] = 4)] = 'Field';
  CompletionItemKind[(CompletionItemKind['Variable'] = 5)] = 'Variable';
  CompletionItemKind[(CompletionItemKind['Class'] = 6)] = 'Class';
  CompletionItemKind[(CompletionItemKind['Interface'] = 7)] = 'Interface';
  CompletionItemKind[(CompletionItemKind['Module'] = 8)] = 'Module';
  CompletionItemKind[(CompletionItemKind['Property'] = 9)] = 'Property';
  CompletionItemKind[(CompletionItemKind['Unit'] = 10)] = 'Unit';
  CompletionItemKind[(CompletionItemKind['Value'] = 11)] = 'Value';
  CompletionItemKind[(CompletionItemKind['Enum'] = 12)] = 'Enum';
  CompletionItemKind[(CompletionItemKind['Keyword'] = 13)] = 'Keyword';
  CompletionItemKind[(CompletionItemKind['Snippet'] = 14)] = 'Snippet';
  CompletionItemKind[(CompletionItemKind['Color'] = 15)] = 'Color';
  CompletionItemKind[(CompletionItemKind['File'] = 16)] = 'File';
  CompletionItemKind[(CompletionItemKind['Reference'] = 17)] = 'Reference';
  CompletionItemKind[(CompletionItemKind['Folder'] = 18)] = 'Folder';
  CompletionItemKind[(CompletionItemKind['EnumMember'] = 19)] = 'EnumMember';
  CompletionItemKind[(CompletionItemKind['Constant'] = 20)] = 'Constant';
  CompletionItemKind[(CompletionItemKind['Struct'] = 21)] = 'Struct';
  CompletionItemKind[(CompletionItemKind['Event'] = 22)] = 'Event';
  CompletionItemKind[(CompletionItemKind['Operator'] = 23)] = 'Operator';
  CompletionItemKind[(CompletionItemKind['TypeParameter'] = 24)] =
    'TypeParameter';
})(
  CompletionItemKind || (exports.CompletionItemKind = CompletionItemKind = {}),
);
class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}
exports.CompletionItem = CompletionItem;
class CompletionList {
  constructor(items = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
}
exports.CompletionList = CompletionList;
class MarkdownString {
  constructor(value) {
    this.value = value;
  }
}
exports.MarkdownString = MarkdownString;
class SemanticTokensLegend {
  constructor(tokenTypes, tokenModifiers) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
  }
}
exports.SemanticTokensLegend = SemanticTokensLegend;
class SemanticTokensBuilder {
  constructor(legend) {
    this.legend = legend;
    this.tokens = [];
  }
  push(line, char, length, tokenType, tokenModifiers) {
    this.tokens.push({ line, char, length, tokenType, tokenModifiers });
  }
  build() {
    return { data: this.tokens }; // Mock representation
  }
}
exports.SemanticTokensBuilder = SemanticTokensBuilder;
class SemanticTokens {
  constructor(data) {
    this.data = data;
  }
}
exports.SemanticTokens = SemanticTokens;

class EventEmitter {
  constructor() {
    this.event = () => ({ dispose: () => {} });
  }
  fire(data) {}
  dispose() {}
}
exports.EventEmitter = EventEmitter;
//# sourceMappingURL=vscode.js.map
