import { RGBA } from '@figma/rest-api-spec'
import { Token, TokensFile } from './token_types.js'
import { isAlias, flattenTokensFile } from './token_import.js';
import { parseColor } from './color.js'
import fs from 'node:fs/promises';

const INPUT_DIR = 'tokens_new';
const OUTPUT_DIR = './dist'

async function main() {
  const tokensFilePaths = await fs.readdir(INPUT_DIR);
  if (!tokensFilePaths.length) {
    console.error('[tokens_to_css] ERR: No input files found. Did you run sync-figma-to-tokens?');
    return 1;
  }

  await ensureDir(OUTPUT_DIR);

  for (const filePath of tokensFilePaths) {
    await readTokensFileAndWriteToCssFile(filePath);
  }

  return 0;
}

async function ensureDir(dirpath: string): Promise<void> {
  try {
    await fs.stat(dirpath);
  } catch {
    await fs.mkdir(dirpath);
  }
}

// Read a token file exported from figma, convert it to CSS variables, and output the CSS
async function readTokensFileAndWriteToCssFile(filePath: string) {
  const tokensFileRaw = await fs.readFile(`${INPUT_DIR}/${filePath}`, 'utf-8');
  const tokensFile = JSON.parse(tokensFileRaw);
  const css = processJsonToCssVars(tokensFile);

  const outfileName = `${OUTPUT_DIR}/${filePath.replace('.json', '.module.scss')}`;
  // Output as a SCSS placeholder selector
  const rootSelector = '%' + filePath.replace('.json', '').replaceAll('.', '-').toLowerCase();
  await writeCssToFile(outfileName, css, rootSelector);

  console.log(`\u2705 Wrote ${outfileName}`);
}

// Take an array of lines and write it as a CSS File
function writeCssToFile(outfileName: string, css: string[], rootSelector: string = ':root') {
  const outfileData = `${rootSelector} {\n${css.map(line => indentLine(line)).join('\n')}\n}`;
  return fs.writeFile(outfileName, outfileData);
}

// TODO: Support more types - https://tr.designtokens.org/format/#types
//       Work with design to better specify types in the Tokens library.
function basicValueFromToken(token: Token): string | number | boolean {
  const value = token.$value;

  if (typeof value === 'object') {
    // see https://tr.designtokens.org/format/#composite-types
    // Apollo doesn't use these yet so this is just for future proofing.
    console.warn('[WARN] Found composite type, these are not yet supported');
    return '"composite_type_not_supported_error"';
  }
  if (typeof value === 'string') {
    if (isAlias(value)) {
      // Values surrounded by brackets are aliases, not primatives.
      return `var(${stringifyAliasToCssVar(value)})`;
    }

    if (token.$type === 'color') {
      return value;
    }

    // Values with whitespace are wrapped in quotes
    return value.includes(' ') ? `'${value}'` : value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  // Numeric values are assumed to be pixels. We should probably use strings instead?
  // Truncate to max of 4 decimal places.
  // Figma API is prone to floating point precision errors.
  return `${Number.parseFloat((value).toFixed(4))}px`;
}

// When processing a token set and we see a new group, add a header comment
// e.g. /* Color/Base/Neutral */
function emitGroupComment(prevGroup: string, nextGroup: string) {
  if (prevGroup === nextGroup) {
    // If the group has not changed, do not emit a comment
    return [ prevGroup, '' ];
  }
  let comment = `/* ${nextGroup} */\n`;
  if (prevGroup) {
    // For all but the first group, include a newline
    comment = `\n${comment}`;
  }

  return [ nextGroup, comment ];
}

// Process a TokensFile to an array of lines of CSS
function processJsonToCssVars(json: TokensFile) {
  const flatTokens = flattenTokensFile(json);
  let group = '';
  let comment = '';

  return Object.entries(flatTokens).map(([ key, token ]: [ key: string, token: Token ]) => {
    const nextGroup = key.split('/').slice(0, -1).join('/');
    [ group, comment ] = emitGroupComment(group, nextGroup);
    return `${comment}--${stringifyTokenKeyToCssVar(key)}: ${basicValueFromToken(token)};`;
  });
}

// Indent one or many lines with a given amount of whitespace
function indentLine(lines: string, tabstop = 2) {
  const whitespace = Array(tabstop).fill(' ').join('');
  return lines.split('\n').map(line =>
    line.length ? `${whitespace}${line.trim()}` : ''
  ).join('\n');
}

// e.g. "Color/Base/Alpha/Highlight-0" -> "color-base-alpha-highlight-0"
function stringifyTokenKeyToCssVar(tokenKey: string): string {
  return tokenKey
    .toLowerCase()
    .replaceAll(/[()]/g, '')  // Strip parenthesis
    .replaceAll(/[/ ]/g, '-') // Replace slashes or whitespace with dashes
}

function stringifyAliasToCssVar(alias: string): string {
  // e.g. {Color.Base.Red.Red-10} -> --color-base-red-red-10
  return '--' + alias
    .toLowerCase()
    .replaceAll('.', '-')
    .replaceAll(' ', '-')
    .replaceAll(/[{}()]/g, '')  // Strip unsupported characters
}

main().then(process.exit)
