import { join } from 'path'
import { SourceMapGenerator } from 'source-map-js'
import { test } from 'uvu'
import { equal, is, not, ok, type } from 'uvu/assert'

import postcss, {
  CssSyntaxError,
  Declaration,
  parse,
  Plugin,
  Rule,
  Warning
} from '../lib/postcss.js'

let css = '.a {\n  color: red;\n}'
let RED_OFFSET = css.indexOf('red')
let RED_END_OFFSET = RED_OFFSET + 3

// `error.input` is optional in the public types, but every error created by
// `Input#error` has it. The helpers below narrow it for the assertions.
function errorSlice(error: CssSyntaxError): string {
  let input = error.input!
  return input.source!.slice(input.offset, input.endOffset)
}

function warningSlice(warning: Warning): string {
  return warning.node.source!.input.css.slice(
    warning.offset,
    warning.endOffset
  )
}

test('Input#error takes a single offset', () => {
  let input = parse(css).source!.input
  let error = input.error('test', RED_OFFSET)

  equal(error.input, {
    column: 10,
    line: 2,
    offset: RED_OFFSET,
    source: css
  })
  not.ok('endOffset' in error.input!)
  not.ok('endLine' in error.input!)
  is(errorSlice(error), css.slice(RED_OFFSET))
})

test('Input#error takes line and column', () => {
  let input = parse(css).source!.input
  let error = input.error('test', 2, 10)

  equal(error.input, {
    column: 10,
    line: 2,
    offset: RED_OFFSET,
    source: css
  })
  not.ok('endOffset' in error.input!)
})

test('Input#error takes two objects with offsets', () => {
  let input = parse(css).source!.input
  let error = input.error(
    'test',
    { offset: RED_OFFSET },
    { offset: RED_END_OFFSET }
  )

  is(error.input!.offset, RED_OFFSET)
  is(error.input!.endOffset, RED_END_OFFSET)
  is(errorSlice(error), 'red')
})

test('Input#error takes two objects with line and column', () => {
  let input = parse(css).source!.input
  let error = input.error(
    'test',
    { column: 10, line: 2 },
    { column: 13, line: 2 }
  )

  equal(error.input, {
    column: 10,
    endColumn: 13,
    endLine: 2,
    endOffset: RED_END_OFFSET,
    line: 2,
    offset: RED_OFFSET,
    source: css
  })
  is(errorSlice(error), 'red')
})

test('Input#error offsets point to the parsed CSS with a BOM', () => {
  let bom = '\uFEFF.a {\n  color: red;\n}'
  let input = parse(bom).source!.input
  is(input.hasBOM, true)

  let byOffset = input.error(
    'test',
    { offset: RED_OFFSET },
    { offset: RED_END_OFFSET }
  )
  is(errorSlice(byOffset), 'red')

  let byLineColumn = input.error(
    'test',
    { column: 10, line: 2 },
    { column: 13, line: 2 }
  )
  is(errorSlice(byLineColumn), 'red')
})

test('Input#error offsets are correct with CRLF line breaks', () => {
  let crlf = '.a {\r\n  color: red;\r\n}'
  let input = parse(crlf).source!.input
  let error = input.error(
    'test',
    { column: 10, line: 2 },
    { column: 13, line: 2 }
  )

  is(errorSlice(error), 'red')
})

test('Node#error exposes offsets for word', () => {
  let decl = (parse(css).first! as Rule).first! as Declaration
  let error = decl.error('test', { word: 'red' })

  is(error.line, 2)
  is(error.column, 10)
  is(error.endLine, 2)
  is(error.endColumn, 13)
  is(error.input!.offset, RED_OFFSET)
  is(error.input!.endOffset, RED_END_OFFSET)
  is(errorSlice(error), 'red')
})

test('Node#error exposes offsets for index', () => {
  let decl = (parse(css).first! as Rule).first! as Declaration
  let error = decl.error('test', { index: 7 })

  is(errorSlice(error), 'r')
})

test('Node#error exposes offsets for start and end', () => {
  let decl = (parse(css).first! as Rule).first! as Declaration
  let error = decl.error('test', {
    end: { column: 13, line: 2 },
    start: { column: 10, line: 2 }
  })

  is(errorSlice(error), 'red')
})

test('Node#error does not fail on source without offsets', () => {
  let root = parse('.a { color: red }')
  let decl = (root.first! as Rule).first! as Declaration
  delete (decl.source!.start as { offset?: number }).offset
  delete (decl.source!.end as { offset?: number }).offset

  let error = decl.error('test', { index: 7 })
  type(error.input!.offset, 'number')
  ok(Number.isFinite(error.input!.offset))
  ok(Number.isFinite(error.input!.endOffset))
  is(errorSlice(error), 'r')
})

test('Node#warn exposes offsets', () => {
  let plugin: Plugin = {
    Declaration(decl: Declaration, { result }) {
      if (decl.prop === 'color') {
        decl.warn(result, 'test', { word: 'red' })
      }
    },
    postcssPlugin: 'test-warn-offset'
  }

  let result = postcss([plugin]).process(css, { from: undefined }).sync()
  let warning = result.warnings()[0]

  is(warning.line, 2)
  is(warning.column, 10)
  is(warning.endLine, 2)
  is(warning.endColumn, 13)
  is(warning.offset, RED_OFFSET)
  is(warning.endOffset, RED_END_OFFSET)
  is(warningSlice(warning), 'red')
})

test('Node#warn does not fail on source without offsets', () => {
  let plugin: Plugin = {
    Declaration(decl: Declaration, { result }) {
      if (decl.prop === 'color') {
        delete (decl.source!.start as { offset?: number }).offset
        delete (decl.source!.end as { offset?: number }).offset
        decl.warn(result, 'test', { index: 7 })
      }
    },
    postcssPlugin: 'test-warn-no-offset'
  }

  let result = postcss([plugin]).process('.a { color: red }', {
    from: undefined
  }).sync()
  let warning = result.warnings()[0]

  ok(Number.isFinite(warning.offset))
  ok(Number.isFinite(warning.endOffset))
  is(warningSlice(warning), 'r')
})

test('Input#fromLineAndColumn is inverse of fromOffset', () => {
  let multiline = 'a {\r\n  b: 1;\n  c: 2;\r\n}'
  let input = parse(multiline).source!.input

  for (let offset = 0; offset < multiline.length; offset++) {
    let { col, line } = input.fromOffset(offset)!
    is(input.fromLineAndColumn(line, col), offset)
  }

  is(input.fromLineAndColumn(1, 1), 0)
})

test('offsets map the parsed CSS while top level uses source map origin', () => {
  // Simulate a Sass compilation: two original files concatenated into one
  // generated CSS, with dense column-accurate mappings.
  let generator = new SourceMapGenerator({ file: 'all.css' })
  let sections = [
    { generatedStart: 1, name: 'a.css', text: '.a {\n  color: red;\n}' },
    { generatedStart: 4, name: 'b.scss', text: 'b {\n  color: blue;\n}' }
  ]
  for (let section of sections) {
    let lines = section.text.split('\n')
    lines.forEach((lineText, i) => {
      for (let column = 0; column <= lineText.length; column++) {
        generator.addMapping({
          generated: { column, line: section.generatedStart + i },
          original: { column, line: i + 1 },
          source: section.name
        })
      }
    })
  }

  let parsedCss = '.a {\n  color: red;\n}\nb {\n  color: blue;\n}\n'
  let root = parse(parsedCss, {
    from: join(__dirname, 'build', 'all.css'),
    map: { prev: generator.toString() }
  })

  let blue: Declaration | undefined
  root.walkDecls('color', decl => {
    if (decl.value === 'blue') blue = decl
  })

  let error = blue!.error('test', { word: 'blue' })

  // Top-level coordinates keep pointing to the Sass source.
  is(error.line, 2)
  is(error.column, 10)
  is(error.endLine, 2)
  is(error.endColumn, 14)
  is(error.file, join(__dirname, 'build', 'b.scss'))

  // Input offsets point to the CSS that PostCSS actually parsed.
  is(error.input!.offset, parsedCss.indexOf('blue'))
  is(error.input!.endOffset, parsedCss.indexOf('blue') + 4)
  is(errorSlice(error), 'blue')
})

test.run()
