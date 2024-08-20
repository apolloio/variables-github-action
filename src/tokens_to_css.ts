import { RGBA } from '@figma/rest-api-spec'
import { Token, TokensFile } from './token_types.js'
import { flattenTokensFile } from './token_import.js';
import { parseColor } from './color.js'
import fs from 'node:fs/promises';

const INPUT_DIR = 'tokens_new';

async function main() {
  const tokensFilePaths = await fs.readdir(INPUT_DIR );
  for (const filePath of tokensFilePaths) {
    const tokensFileRaw = await fs.readFile(`${INPUT_DIR}/${filePath}`, 'utf-8');
    const tokensFile = JSON.parse(tokensFileRaw);
    const css = processJsonToCssVars(tokensFile);

    try {
      await fs.stat('./dist');
    } catch {
      await fs.mkdir('./dist');
    }

    const outfileName = `dist/${filePath.replace('.json', '.css')}`
    const outfileData = `:root {\n${css.map(line => `  ${line}`).join('\n')}\n}`;
    await fs.writeFile(outfileName, outfileData);
    console.log(`✅ Wrote ${outfileName}`);
  }
}

function aliasToCssVar(alias: string): string {
  // e.g. {Color.Base.Red.Red-10} -> --color-base-red-red-10
  return '--' + alias
    .toLowerCase()
    .replaceAll('.', '-')
    .replace('{', '')
    .replace('}', '');
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
    if (value[0] === '{' && value[value.length - 1] === '}') {
      // Values surrounded by brackets are aliases, not primatives.
      return `var(${aliasToCssVar(value)})`;
    }

    if (token.$type === 'color') {
      let { r, g, b, a } = parseColor(value) as RGBA;
      r *= 255;
      g *= 255;
      b *= 255;
      if (a) {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
      return `rgb(${r}, ${g}, ${b})`;
    }

    // Values such as font family are wrapped in quotes
    return `"${value}"`;
  }

  // Numeric values are returned without modification
  return value;
}

function processJsonToCssVars(json: TokensFile) {
  const flatTokens = flattenTokensFile(json);

  return Object.entries(flatTokens).map(([ key, token ]: [ key: string, token: Token ]) => (
    `--${key.toLowerCase().replaceAll('/', '-')}: ${basicValueFromToken(token)};`
  ));
}

main();
