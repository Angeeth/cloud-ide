// Monaco Editor Auto-Complete & IntelliSense Provider for Mirage IDE
// High-fidelity VS Code-style auto-write completions, snippets, and member suggestions

let disposables = [];

export function setupIntelliSense(monaco) {
  if (!monaco || !monaco.languages) return;

  // Clean up any previously registered providers to prevent duplicate suggestions
  disposables.forEach((d) => {
    try { d.dispose(); } catch (e) {}
  });
  disposables = [];

  const CompletionItemKind = monaco.languages.CompletionItemKind;
  const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  // Configure Monaco built-in JavaScript/TypeScript compiler defaults for ESNext
  if (monaco.languages.typescript?.javascriptDefaults) {
    try {
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false
      });
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowJs: true
      });
    } catch (e) {
      // Ignored if typescript service is unavailable
    }
  }

  // ==========================================
  // HELPER UTILITIES
  // ==========================================

  // Accurately checks whether the cursor is accessing a member (. or -> or ::)
  function checkMemberAccess(model, position) {
    const lineContent = model.getLineContent(position.lineNumber);
    const word = model.getWordUntilPosition(position);
    // Extract line content strictly up to the start of the current word
    const textBeforeWord = lineContent.substring(0, word.startColumn - 1).trimEnd();

    const isDot = textBeforeWord.endsWith('.');
    const isArrow = textBeforeWord.endsWith('->');
    const isColonColon = textBeforeWord.endsWith('::');

    return {
      isMember: isDot || isArrow,
      isColonColon,
      word,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
    };
  }

  // Harvests document identifiers (variables, functions, classes) for intelligent context completion
  function getDocumentSymbols(model, currentWord) {
    const text = model.getValue();
    const regex = /\b[a-zA-Z_$][a-zA-Z0-9_$]{1,40}\b/g;
    const symbols = new Set();
    let match;
    let count = 0;
    while ((match = regex.exec(text)) !== null && count < 250) {
      const w = match[0];
      if (w !== currentWord && !isCommonKeyword(w)) {
        symbols.add(w);
        count++;
      }
    }
    return Array.from(symbols);
  }

  function isCommonKeyword(w) {
    const keywords = new Set([
      'function', 'const', 'let', 'var', 'return', 'import', 'export', 'default',
      'class', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
      'true', 'false', 'null', 'undefined', 'def', 'print', 'self', 'public', 'static',
      'void', 'int', 'char', 'float', 'double', 'include', 'main', 'string', 'boolean',
      'new', 'typeof', 'instanceof', 'try', 'catch', 'finally', 'throw', 'yield', 'await', 'async'
    ]);
    return keywords.has(w);
  }

  // ==========================================
  // 1. JAVASCRIPT / TYPESCRIPT COMPLETIONS
  // ==========================================
  const jsTopLevel = [
    { label: 'console.log', insertText: 'console.log(${1:item});', filterText: 'console.log clg log', detail: 'console.log(item)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '10_clg' },
    { label: 'console.error', insertText: 'console.error(${1:err});', filterText: 'console.error cerr err', detail: 'console.error(err)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '11_cerr' },
    { label: 'console.warn', insertText: 'console.warn(${1:msg});', filterText: 'console.warn cwarn warn', detail: 'console.warn(msg)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '12_cwarn' },
    { label: 'console.table', insertText: 'console.table(${1:data});', filterText: 'console.table ctab table', detail: 'console.table(data)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '13_ctab' },
    { label: 'function', insertText: 'function ${1:name}(${2:params}) {\n\t${0}\n}', filterText: 'function fn def func', detail: 'Function declaration', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '14_fn' },
    { label: 'arrow function', insertText: 'const ${1:name} = (${2:params}) => {\n\t${0}\n};', filterText: 'const arrow fn afn =>', detail: 'Arrow function expression', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '15_afn' },
    { label: 'async function', insertText: 'async function ${1:name}(${2:params}) {\n\t${0}\n}', filterText: 'async function asfn', detail: 'Async function declaration', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '16_asfn' },
    { label: 'for', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t${0}\n}', filterText: 'for loop fori', detail: 'Standard for loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '17_for' },
    { label: 'for...of', insertText: 'for (const ${1:item} of ${2:iterable}) {\n\t${0}\n}', filterText: 'forof for of', detail: 'For-of loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '18_forof' },
    { label: 'for...in', insertText: 'for (const ${1:key} in ${2:object}) {\n\t${0}\n}', filterText: 'forin for in', detail: 'For-in loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '19_forin' },
    { label: 'if', insertText: 'if (${1:condition}) {\n\t${0}\n}', filterText: 'if condition', detail: 'If statement', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '20_if' },
    { label: 'if...else', insertText: 'if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}', filterText: 'ifelse if else', detail: 'If-Else block', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '21_ifelse' },
    { label: 'try...catch', insertText: 'try {\n\t${1}\n} catch (${2:error}) {\n\t${0:console.error(error);}\n}', filterText: 'try catch try/catch', detail: 'Try-Catch block', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '22_try' },
    { label: 'import', insertText: "import ${1:name} from '${2:module}';", filterText: 'import from imp', detail: 'ESM import statement', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '23_imp' },
    { label: 'export', insertText: 'export default ${1:name};', filterText: 'export default exp', detail: 'Export default', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '24_exp' },
    { label: 'setTimeout', insertText: 'setTimeout(() => {\n\t${0}\n}, ${1:1000});', filterText: 'setTimeout settimeout sto', detail: 'setTimeout(callback, ms)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '25_sto' },
    { label: 'setInterval', insertText: 'setInterval(() => {\n\t${0}\n}, ${1:1000});', filterText: 'setInterval setinterval sti', detail: 'setInterval(callback, ms)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '26_sti' },
    { label: 'Promise', insertText: 'new Promise((resolve, reject) => {\n\t${0}\n});', filterText: 'Promise new promise prom', detail: 'New Promise constructor', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '27_prom' },
    { label: 'fetch', insertText: 'fetch(${1:url})\n\t.then(res => res.json())\n\t.then(data => {\n\t\t${0}\n\t});', filterText: 'fetch api request', detail: 'fetch(url)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '28_fetch' },
    { label: 'JSON.stringify', insertText: 'JSON.stringify(${1:obj}, null, 2)', filterText: 'JSON.stringify json stringify', detail: 'JSON.stringify(obj)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '29_jstr' },
    { label: 'JSON.parse', insertText: 'JSON.parse(${1:str})', filterText: 'JSON.parse json parse', detail: 'JSON.parse(str)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '30_jprs' }
  ];

  // JavaScript member methods (suggested strictly when accessing after dot '.')
  const jsMembers = [
    { label: 'log', insertText: 'log(${1:item})', detail: 'console.log(item)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '01_log' },
    { label: 'error', insertText: 'error(${1:err})', detail: 'console.error(err)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '02_err' },
    { label: 'warn', insertText: 'warn(${1:msg})', detail: 'console.warn(msg)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '03_warn' },
    { label: 'table', insertText: 'table(${1:data})', detail: 'console.table(data)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '04_tab' },
    { label: 'map', insertText: 'map((${1:item}) => ${0})', detail: 'Array.prototype.map()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '05_map' },
    { label: 'filter', insertText: 'filter((${1:item}) => ${0})', detail: 'Array.prototype.filter()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '06_filter' },
    { label: 'forEach', insertText: 'forEach((${1:item}) => {\n\t${0}\n})', detail: 'Array.prototype.forEach()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '07_forEach' },
    { label: 'reduce', insertText: 'reduce((${1:acc}, ${2:curr}) => ${0}, ${3:initial})', detail: 'Array.prototype.reduce()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '08_reduce' },
    { label: 'find', insertText: 'find((${1:item}) => ${0})', detail: 'Array.prototype.find()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '09_find' },
    { label: 'findIndex', insertText: 'findIndex((${1:item}) => ${0})', detail: 'Array.prototype.findIndex()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '10_findIndex' },
    { label: 'includes', insertText: 'includes(${1:item})', detail: 'Array/String includes()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '11_includes' },
    { label: 'some', insertText: 'some((${1:item}) => ${0})', detail: 'Array.prototype.some()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '12_some' },
    { label: 'every', insertText: 'every((${1:item}) => ${0})', detail: 'Array.prototype.every()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '13_every' },
    { label: 'push', insertText: 'push(${1:item})', detail: 'Array.prototype.push()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '14_push' },
    { label: 'pop', insertText: 'pop()', detail: 'Array.prototype.pop()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '15_pop' },
    { label: 'slice', insertText: 'slice(${1:start}, ${2:end})', detail: 'Array/String slice()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '16_slice' },
    { label: 'splice', insertText: 'splice(${1:start}, ${2:count})', detail: 'Array.prototype.splice()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '17_splice' },
    { label: 'join', insertText: 'join("${1:,}")', detail: 'Array.prototype.join()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '18_join' },
    { label: 'length', insertText: 'length', detail: 'Length property', kind: CompletionItemKind.Property, isSnippet: false, sortText: '19_length' },
    { label: 'split', insertText: 'split("${1:,}")', detail: 'String.prototype.split()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '20_split' },
    { label: 'trim', insertText: 'trim()', detail: 'String.prototype.trim()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '21_trim' },
    { label: 'replace', insertText: 'replace(${1:search}, ${2:replacement})', detail: 'String.prototype.replace()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '22_replace' },
    { label: 'replaceAll', insertText: 'replaceAll(${1:search}, ${2:replacement})', detail: 'String.prototype.replaceAll()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '23_replaceAll' },
    { label: 'toLowerCase', insertText: 'toLowerCase()', detail: 'String.prototype.toLowerCase()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '24_toLower' },
    { label: 'toUpperCase', insertText: 'toUpperCase()', detail: 'String.prototype.toUpperCase()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '25_toUpper' },
    { label: 'startsWith', insertText: 'startsWith("${1:prefix}")', detail: 'String.prototype.startsWith()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '26_starts' },
    { label: 'endsWith', insertText: 'endsWith("${1:suffix}")', detail: 'String.prototype.endsWith()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '27_ends' },
    { label: 'then', insertText: 'then((${1:res}) => {\n\t${0}\n})', detail: 'Promise.prototype.then()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '28_then' },
    { label: 'catch', insertText: 'catch((${1:err}) => {\n\t${0}\n})', detail: 'Promise.prototype.catch()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '29_catch' },
    { label: 'toString', insertText: 'toString()', detail: 'Object.prototype.toString()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '30_toString' }
  ];

  const jsProvider = monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const { isMember, word, range } = checkMemberAccess(model, position);

      if (isMember) {
        // Dot member access: return member methods and property symbols
        const symbols = getDocumentSymbols(model, word.word);
        const propSuggestions = symbols.map((sym, idx) => ({
          label: sym,
          insertText: sym,
          detail: 'Property / Identifier',
          kind: CompletionItemKind.Property,
          range,
          sortText: `50_${String(idx).padStart(3, '0')}`
        }));

        const memberSuggestions = jsMembers.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }));

        return {
          suggestions: [...memberSuggestions, ...propSuggestions]
        };
      }

      // Top-level: return local variables/functions and standard snippets
      const symbols = getDocumentSymbols(model, word.word);
      const symbolSuggestions = symbols.map((sym, idx) => ({
        label: sym,
        insertText: sym,
        detail: 'Local variable / function',
        kind: CompletionItemKind.Variable,
        range,
        sortText: `05_${String(idx).padStart(3, '0')}`
      }));

      const topSuggestions = jsTopLevel.map((item) => ({
        ...item,
        range,
        insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
      }));

      return {
        suggestions: [...symbolSuggestions, ...topSuggestions]
      };
    }
  });
  disposables.push(jsProvider);

  // ==========================================
  // 2. PYTHON COMPLETIONS
  // ==========================================
  const pyTopLevel = [
    { label: 'def', insertText: 'def ${1:function_name}(${2:args}):\n\t${0:pass}', filterText: 'def fn function', detail: 'Function definition', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '10_def' },
    { label: 'class', insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, args}):\n\t\t${0:pass}', filterText: 'class definition', detail: 'Class definition with __init__', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '11_class' },
    { label: 'main', insertText: "if __name__ == '__main__':\n\t${0:main()}", filterText: "main ifmain __name__", detail: "if __name__ == '__main__':", kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '12_main' },
    { label: 'print', insertText: 'print(${1:value})', filterText: 'print pr sout', detail: 'print(value)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '13_print' },
    { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n\t${0:pass}', filterText: 'for loop in', detail: 'For-in loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '14_for' },
    { label: 'fori', insertText: 'for ${1:i} in range(${2:n}):\n\t${0:pass}', filterText: 'fori for range', detail: 'For loop with range(n)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '15_fori' },
    { label: 'while', insertText: 'while ${1:condition}:\n\t${0:pass}', filterText: 'while loop', detail: 'While loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '16_while' },
    { label: 'if', insertText: 'if ${1:condition}:\n\t${0:pass}', filterText: 'if condition', detail: 'If statement', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '17_if' },
    { label: 'if...else', insertText: 'if ${1:condition}:\n\t${2:pass}\nelse:\n\t${0:pass}', filterText: 'ifelse if else', detail: 'If-Else block', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '18_ifelse' },
    { label: 'try...except', insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${0:print(e)}', filterText: 'try except try/except', detail: 'Try-Except block', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '19_try' },
    { label: 'with', insertText: 'with open("${1:filename}", "${2:r}") as ${3:f}:\n\t${0:content = f.read()}', filterText: 'with open with open file', detail: 'With open context manager', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '20_with' },
    { label: 'import', insertText: 'import ${1:module}', filterText: 'import imp', detail: 'import module', kind: CompletionItemKind.Keyword, isSnippet: true, sortText: '21_import' },
    { label: 'from', insertText: 'from ${1:module} import ${2:name}', filterText: 'from import', detail: 'from module import name', kind: CompletionItemKind.Keyword, isSnippet: true, sortText: '22_from' },
    { label: 'len', insertText: 'len(${1:obj})', filterText: 'len length count', detail: 'len(container)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '23_len' },
    { label: 'range', insertText: 'range(${1:stop})', filterText: 'range', detail: 'range(start, stop, step)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '24_range' },
    { label: 'input', insertText: 'input("${1:prompt: }")', filterText: 'input prompt read', detail: 'input(prompt)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '25_input' },
    { label: 'enumerate', insertText: 'enumerate(${1:iterable})', filterText: 'enumerate enum', detail: 'enumerate(iterable)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '26_enum' },
    { label: 'isinstance', insertText: 'isinstance(${1:obj}, ${2:class})', filterText: 'isinstance type check', detail: 'isinstance(obj, class)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '27_isinstance' },
    { label: 'list', insertText: 'list(${1:iterable})', filterText: 'list convert', detail: 'list() constructor', kind: CompletionItemKind.Function, isSnippet: true, sortText: '28_list' },
    { label: 'dict', insertText: 'dict(${1})', filterText: 'dict dictionary', detail: 'dict() constructor', kind: CompletionItemKind.Function, isSnippet: true, sortText: '29_dict' },
    { label: 'return', insertText: 'return ${0}', filterText: 'return ret', detail: 'return statement', kind: CompletionItemKind.Keyword, isSnippet: true, sortText: '30_return' }
  ];

  const pyMembers = [
    { label: 'append', insertText: 'append(${1:item})', detail: 'list.append(x)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '01_append' },
    { label: 'extend', insertText: 'extend(${1:iterable})', detail: 'list.extend(iterable)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '02_extend' },
    { label: 'pop', insertText: 'pop(${1})', detail: 'Remove and return item', kind: CompletionItemKind.Method, isSnippet: true, sortText: '03_pop' },
    { label: 'remove', insertText: 'remove(${1:item})', detail: 'Remove first occurrence', kind: CompletionItemKind.Method, isSnippet: true, sortText: '04_remove' },
    { label: 'index', insertText: 'index(${1:item})', detail: 'Return index of item', kind: CompletionItemKind.Method, isSnippet: true, sortText: '05_index' },
    { label: 'count', insertText: 'count(${1:item})', detail: 'Count occurrences', kind: CompletionItemKind.Method, isSnippet: true, sortText: '06_count' },
    { label: 'sort', insertText: 'sort()', detail: 'Sort list in place', kind: CompletionItemKind.Method, isSnippet: true, sortText: '07_sort' },
    { label: 'reverse', insertText: 'reverse()', detail: 'Reverse list in place', kind: CompletionItemKind.Method, isSnippet: true, sortText: '08_reverse' },
    { label: 'split', insertText: 'split("${1: }")', detail: 'str.split(sep)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '09_split' },
    { label: 'join', insertText: 'join(${1:iterable})', detail: 'str.join(iterable)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '10_join' },
    { label: 'strip', insertText: 'strip()', detail: 'str.strip()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '11_strip' },
    { label: 'replace', insertText: 'replace("${1:old}", "${2:new}")', detail: 'str.replace(old, new)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '12_replace' },
    { label: 'lower', insertText: 'lower()', detail: 'str.lower()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '13_lower' },
    { label: 'upper', insertText: 'upper()', detail: 'str.upper()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '14_upper' },
    { label: 'startswith', insertText: 'startswith("${1:prefix}")', detail: 'str.startswith(prefix)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '15_start' },
    { label: 'endswith', insertText: 'endswith("${1:suffix}")', detail: 'str.endswith(suffix)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '16_end' },
    { label: 'keys', insertText: 'keys()', detail: 'dict.keys()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '17_keys' },
    { label: 'values', insertText: 'values()', detail: 'dict.values()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '18_values' },
    { label: 'items', insertText: 'items()', detail: 'dict.items()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '19_items' },
    { label: 'get', insertText: 'get(${1:key}, ${2:None})', detail: 'dict.get(key, default)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '20_get' },
    { label: 'read', insertText: 'read()', detail: 'file.read()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '21_read' },
    { label: 'readline', insertText: 'readline()', detail: 'file.readline()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '22_readline' },
    { label: 'write', insertText: 'write(${1:data})', detail: 'file.write(data)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '23_write' }
  ];

  const pyProvider = monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const { isMember, word, range } = checkMemberAccess(model, position);

      if (isMember) {
        const symbols = getDocumentSymbols(model, word.word);
        const propSuggestions = symbols.map((sym, idx) => ({
          label: sym,
          insertText: sym,
          detail: 'Attribute / Symbol',
          kind: CompletionItemKind.Property,
          range,
          sortText: `50_${String(idx).padStart(3, '0')}`
        }));

        const memberSuggestions = pyMembers.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }));

        return {
          suggestions: [...memberSuggestions, ...propSuggestions]
        };
      }

      const symbols = getDocumentSymbols(model, word.word);
      const symbolSuggestions = symbols.map((sym, idx) => ({
        label: sym,
        insertText: sym,
        detail: 'Local variable / symbol',
        kind: CompletionItemKind.Variable,
        range,
        sortText: `05_${String(idx).padStart(3, '0')}`
      }));

      const topSuggestions = pyTopLevel.map((item) => ({
        ...item,
        range,
        insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
      }));

      return {
        suggestions: [...symbolSuggestions, ...topSuggestions]
      };
    }
  });
  disposables.push(pyProvider);

  // ==========================================
  // 3. JAVA COMPLETIONS
  // ==========================================
  const javaTopLevel = [
    { label: 'psvm', insertText: 'public static void main(String[] args) {\n\t${0}\n}', filterText: 'psvm main public static void main', detail: 'public static void main(String[] args)', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '10_psvm' },
    { label: 'sout', insertText: 'System.out.println(${1});', filterText: 'sout System.out.println sysout print', detail: 'System.out.println()', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '11_sout' },
    { label: 'souf', insertText: 'System.out.printf("${1:%s}\\n", ${2});', filterText: 'souf System.out.printf printf', detail: 'System.out.printf()', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '12_souf' },
    { label: 'class', insertText: 'public class ${1:Main} {\n\t${0}\n}', filterText: 'class public class', detail: 'Class definition', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '13_class' },
    { label: 'fori', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', filterText: 'fori for int', detail: 'For loop with index', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '14_fori' },
    { label: 'foreach', insertText: 'for (${1:String} ${2:item} : ${3:collection}) {\n\t${0}\n}', filterText: 'foreach for each', detail: 'Enhanced for-each loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '15_foreach' },
    { label: 'while', insertText: 'while (${1:condition}) {\n\t${0}\n}', filterText: 'while loop', detail: 'While loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '16_while' },
    { label: 'if', insertText: 'if (${1:condition}) {\n\t${0}\n}', filterText: 'if condition', detail: 'If statement', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '17_if' },
    { label: 'try...catch', insertText: 'try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${3:e}.printStackTrace();\n}', filterText: 'try catch', detail: 'Try-Catch block', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '18_try' },
    { label: 'Scanner', insertText: 'Scanner scanner = new Scanner(System.in);\n${0}', filterText: 'Scanner scanner input', detail: 'Scanner for stdin', kind: CompletionItemKind.Class, isSnippet: true, sortText: '19_scanner' },
    { label: 'ArrayList', insertText: 'List<${1:String}> ${2:list} = new ArrayList<>();', filterText: 'ArrayList list', detail: 'New ArrayList', kind: CompletionItemKind.Class, isSnippet: true, sortText: '20_arraylist' },
    { label: 'HashMap', insertText: 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', filterText: 'HashMap map', detail: 'New HashMap', kind: CompletionItemKind.Class, isSnippet: true, sortText: '21_hashmap' },
    { label: 'System.out.println', insertText: 'System.out.println(${1});', filterText: 'System.out.println sout println', detail: 'System.out.println()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '22_sout' }
  ];

  const javaMembers = [
    { label: 'println', insertText: 'println(${1})', detail: 'System.out.println()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '01_println' },
    { label: 'print', insertText: 'print(${1})', detail: 'System.out.print()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '02_print' },
    { label: 'printf', insertText: 'printf("${1:%s}\\n", ${2})', detail: 'System.out.printf()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '03_printf' },
    { label: 'length', insertText: 'length()', detail: 'String.length()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '04_length' },
    { label: 'size', insertText: 'size()', detail: 'Collection.size()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '05_size' },
    { label: 'add', insertText: 'add(${1:item})', detail: 'List.add(item)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '06_add' },
    { label: 'get', insertText: 'get(${1:index})', detail: 'List.get(index)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '07_get' },
    { label: 'remove', insertText: 'remove(${1:index})', detail: 'List.remove(index)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '08_remove' },
    { label: 'contains', insertText: 'contains(${1:item})', detail: 'Check if element exists', kind: CompletionItemKind.Method, isSnippet: true, sortText: '09_contains' },
    { label: 'isEmpty', insertText: 'isEmpty()', detail: 'Check if empty', kind: CompletionItemKind.Method, isSnippet: true, sortText: '10_isEmpty' },
    { label: 'equals', insertText: 'equals(${1:obj})', detail: 'Object equality', kind: CompletionItemKind.Method, isSnippet: true, sortText: '11_equals' },
    { label: 'toString', insertText: 'toString()', detail: 'Object.toString()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '12_toString' }
  ];

  const javaProvider = monaco.languages.registerCompletionItemProvider('java', {
    triggerCharacters: ['.'],
    provideCompletionItems: (model, position) => {
      const { isMember, word, range } = checkMemberAccess(model, position);

      if (isMember) {
        const symbols = getDocumentSymbols(model, word.word);
        const propSuggestions = symbols.map((sym, idx) => ({
          label: sym,
          insertText: sym,
          detail: 'Member / Method',
          kind: CompletionItemKind.Method,
          range,
          sortText: `50_${String(idx).padStart(3, '0')}`
        }));

        const memberSuggestions = javaMembers.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }));

        return {
          suggestions: [...memberSuggestions, ...propSuggestions]
        };
      }

      const symbols = getDocumentSymbols(model, word.word);
      const symbolSuggestions = symbols.map((sym, idx) => ({
        label: sym,
        insertText: sym,
        detail: 'Class / Identifier',
        kind: CompletionItemKind.Variable,
        range,
        sortText: `05_${String(idx).padStart(3, '0')}`
      }));

      const topSuggestions = javaTopLevel.map((item) => ({
        ...item,
        range,
        insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
      }));

      return {
        suggestions: [...symbolSuggestions, ...topSuggestions]
      };
    }
  });
  disposables.push(javaProvider);

  // ==========================================
  // 4. C / C++ COMPLETIONS
  // ==========================================
  const cTopLevel = [
    { label: 'main', insertText: 'int main() {\n\t${0:printf("Hello, World!\\n");}\n\treturn 0;\n}', filterText: 'int main main void main', detail: 'int main() function', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '10_main' },
    { label: 'main (C++)', insertText: '#include <iostream>\n\nint main() {\n\tstd::cout << "${1:Hello, World!}" << std::endl;\n\treturn 0;\n}', filterText: 'main cpp cout iostream', detail: 'C++ main with std::cout', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '11_maincpp' },
    { label: 'printf', insertText: 'printf("${1:%s}\\n", ${2:args});', filterText: 'printf print sout', detail: 'printf(format, ...)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '12_printf' },
    { label: 'scanf', insertText: 'scanf("${1:%d}", &${2:var});', filterText: 'scanf read input', detail: 'scanf(format, &var)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '13_scanf' },
    { label: '#include <stdio.h>', insertText: '#include <stdio.h>\n', filterText: '#include stdio.h include stdio', detail: '#include <stdio.h>', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '14_inc_stdio' },
    { label: '#include <stdlib.h>', insertText: '#include <stdlib.h>\n', filterText: '#include stdlib.h include stdlib', detail: '#include <stdlib.h>', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '15_inc_stdlib' },
    { label: '#include <string.h>', insertText: '#include <string.h>\n', filterText: '#include string.h include string', detail: '#include <string.h>', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '16_inc_string' },
    { label: '#include <iostream>', insertText: '#include <iostream>\nusing namespace std;\n', filterText: '#include iostream include iostream', detail: '#include <iostream>', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '17_inc_iostream' },
    { label: '#include <vector>', insertText: '#include <vector>\n', filterText: '#include vector include vector', detail: '#include <vector>', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '18_inc_vec' },
    { label: 'cout', insertText: 'std::cout << ${1:msg} << std::endl;', filterText: 'cout std::cout << print', detail: 'std::cout << msg << std::endl', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '19_cout' },
    { label: 'cin', insertText: 'std::cin >> ${1:var};', filterText: 'cin std::cin >> input', detail: 'std::cin >> var', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '20_cin' },
    { label: 'for', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', filterText: 'for loop fori', detail: 'For loop with index', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '21_for' },
    { label: 'while', insertText: 'while (${1:condition}) {\n\t${0}\n}', filterText: 'while loop', detail: 'While loop', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '22_while' },
    { label: 'if', insertText: 'if (${1:condition}) {\n\t${0}\n}', filterText: 'if condition', detail: 'If statement', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '23_if' },
    { label: 'malloc', insertText: '(${1:int*})malloc(${2:count} * sizeof(${3:int}))', filterText: 'malloc allocate memory', detail: 'malloc(size)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '24_malloc' },
    { label: 'free', insertText: 'free(${1:ptr});', filterText: 'free memory deallocate', detail: 'free(ptr)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '25_free' },
    { label: 'sizeof', insertText: 'sizeof(${1:type})', filterText: 'sizeof size', detail: 'sizeof(type)', kind: CompletionItemKind.Function, isSnippet: true, sortText: '26_sizeof' },
    { label: 'struct', insertText: 'struct ${1:Name} {\n\t${0}\n};', filterText: 'struct typedef', detail: 'Struct definition', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '27_struct' }
  ];

  const cMembers = [
    { label: 'push_back', insertText: 'push_back(${1:val})', detail: 'vector.push_back(val)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '01_push_back' },
    { label: 'pop_back', insertText: 'pop_back()', detail: 'vector.pop_back()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '02_pop_back' },
    { label: 'size', insertText: 'size()', detail: 'Container size()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '03_size' },
    { label: 'empty', insertText: 'empty()', detail: 'Container empty()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '04_empty' },
    { label: 'clear', insertText: 'clear()', detail: 'Container clear()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '05_clear' },
    { label: 'begin', insertText: 'begin()', detail: 'Iterator begin()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '06_begin' },
    { label: 'end', insertText: 'end()', detail: 'Iterator end()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '07_end' },
    { label: 'insert', insertText: 'insert(${1:val})', detail: 'insert(val)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '08_insert' },
    { label: 'erase', insertText: 'erase(${1:pos})', detail: 'erase(pos)', kind: CompletionItemKind.Method, isSnippet: true, sortText: '09_erase' },
    { label: 'c_str', insertText: 'c_str()', detail: 'std::string.c_str()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '10_cstr' },
    { label: 'length', insertText: 'length()', detail: 'std::string.length()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '11_length' },
    { label: 'substr', insertText: 'substr(${1:pos}, ${2:count})', detail: 'std::string.substr()', kind: CompletionItemKind.Method, isSnippet: true, sortText: '12_substr' }
  ];

  const cppScopeMembers = [
    { label: 'cout', insertText: 'cout << ${1:msg} << endl;', detail: 'std::cout stream', kind: CompletionItemKind.Variable, isSnippet: true, sortText: '01_cout' },
    { label: 'cin', insertText: 'cin >> ${1:var};', detail: 'std::cin stream', kind: CompletionItemKind.Variable, isSnippet: true, sortText: '02_cin' },
    { label: 'endl', insertText: 'endl', detail: 'std::endl newline flush', kind: CompletionItemKind.Variable, isSnippet: false, sortText: '03_endl' },
    { label: 'string', insertText: 'string ${1:str};', detail: 'std::string type', kind: CompletionItemKind.Class, isSnippet: true, sortText: '04_str' },
    { label: 'vector', insertText: 'vector<${1:int}> ${2:vec};', detail: 'std::vector container', kind: CompletionItemKind.Class, isSnippet: true, sortText: '05_vec' },
    { label: 'map', insertText: 'map<${1:string}, ${2:int}> ${3:mp};', detail: 'std::map associative container', kind: CompletionItemKind.Class, isSnippet: true, sortText: '06_map' },
    { label: 'pair', insertText: 'pair<${1:int}, ${2:int}> ${3:p};', detail: 'std::pair', kind: CompletionItemKind.Class, isSnippet: true, sortText: '07_pair' },
    { label: 'sort', insertText: 'sort(${1:v}.begin(), ${1:v}.end());', detail: 'std::sort algorithm', kind: CompletionItemKind.Function, isSnippet: true, sortText: '08_sort' }
  ];

  for (const lang of ['c', 'cpp']) {
    const cProvider = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', '>', ':'],
      provideCompletionItems: (model, position) => {
        const { isMember, isColonColon, word, range } = checkMemberAccess(model, position);

        if (isColonColon) {
          // Scope resolution after :: (e.g. std::)
          return {
            suggestions: cppScopeMembers.map((item) => ({
              ...item,
              range,
              insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
            }))
          };
        }

        if (isMember) {
          // Member access after . or ->
          const symbols = getDocumentSymbols(model, word.word);
          const propSuggestions = symbols.map((sym, idx) => ({
            label: sym,
            insertText: sym,
            detail: 'Member / Property',
            kind: CompletionItemKind.Property,
            range,
            sortText: `50_${String(idx).padStart(3, '0')}`
          }));

          const memberSuggestions = cMembers.map((item) => ({
            ...item,
            range,
            insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
          }));

          return {
            suggestions: [...memberSuggestions, ...propSuggestions]
          };
        }

        const symbols = getDocumentSymbols(model, word.word);
        const symbolSuggestions = symbols.map((sym, idx) => ({
          label: sym,
          insertText: sym,
          detail: 'Identifier',
          kind: CompletionItemKind.Variable,
          range,
          sortText: `05_${String(idx).padStart(3, '0')}`
        }));

        const topSuggestions = cTopLevel.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }));

        return {
          suggestions: [...symbolSuggestions, ...topSuggestions]
        };
      }
    });
    disposables.push(cProvider);
  }

  // ==========================================
  // 5. HTML COMPLETIONS
  // ==========================================
  const htmlSnippets = [
    {
      label: '!',
      insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${0}\n</body>\n</html>',
      filterText: '! html5 boilerplate doc',
      detail: 'HTML5 Boilerplate Template',
      kind: CompletionItemKind.Snippet,
      isSnippet: true,
      sortText: '01_html5'
    },
    { label: 'div', insertText: '<div class="${1:className}">\n\t${0}\n</div>', filterText: 'div container box', detail: '<div> container', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '02_div' },
    { label: 'button', insertText: '<button type="${1:button}" class="${2:btn}">\n\t${0:Click Me}\n</button>', filterText: 'button btn', detail: '<button> element', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '03_btn' },
    { label: 'input', insertText: '<input type="${1:text}" placeholder="${2:Enter value...}" />', filterText: 'input text field', detail: '<input> field', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '04_input' },
    { label: 'form', insertText: '<form onSubmit="${1:handleSubmit}">\n\t${0}\n</form>', filterText: 'form submit', detail: '<form> element', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '05_form' },
    { label: 'link:css', insertText: '<link rel="stylesheet" href="${1:styles.css}" />', filterText: 'link css style', detail: '<link rel="stylesheet">', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '06_link' },
    { label: 'script:src', insertText: '<script src="${1:app.js}"></script>', filterText: 'script js source', detail: '<script src="...">', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '07_script' }
  ];

  const htmlProvider = monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['!', '<'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      return {
        suggestions: htmlSnippets.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }))
      };
    }
  });
  disposables.push(htmlProvider);

  // ==========================================
  // 6. CSS COMPLETIONS
  // ==========================================
  const cssSnippets = [
    { label: 'flex-center', insertText: 'display: flex;\nalign-items: center;\njustify-content: center;', filterText: 'flex center align justify', detail: 'Flexbox Centering', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '01_flex' },
    { label: 'grid-columns', insertText: 'display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);\ngap: ${2:1rem};', filterText: 'grid template columns repeat', detail: 'Grid Responsive Columns', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '02_grid' },
    { label: 'box-shadow', insertText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);', filterText: 'box shadow shadow', detail: 'Subtle Drop Shadow', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '03_shadow' },
    { label: 'glassmorphism', insertText: 'background: rgba(255, 255, 255, 0.05);\nbackdrop-filter: blur(12px);\nborder: 1px solid rgba(255, 255, 255, 0.1);', filterText: 'glass blur glassmorphism backdrop', detail: 'Glassmorphism Effect', kind: CompletionItemKind.Snippet, isSnippet: true, sortText: '04_glass' }
  ];

  const cssProvider = monaco.languages.registerCompletionItemProvider('css', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      return {
        suggestions: cssSnippets.map((item) => ({
          ...item,
          range,
          insertTextRules: item.isSnippet ? InsertAsSnippet : undefined
        }))
      };
    }
  });
  disposables.push(cssProvider);
}
