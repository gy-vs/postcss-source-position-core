import { join } from 'path'
import { SourceMapGenerator } from 'source-map-js'
import { test } from 'uvu'
import { equal, is, type } from 'uvu/assert'

import postcss, {
  CssSyntaxError,
  Declaration,
  Input,
  Rule
} from '../lib/postcss.js'

function sliceError(error: CssSyntaxError): string {
  let text = error.input!.source!
  let end =
    typeof error.input!.endOffset === 'number'
      ? error.input!.endOffset
      : error.input!.offset + 1
  return text.slice(error.input!.offset, end)
}

test('Input#error accepts a single offset', () => {
  let source = 'a { color: red }'
  let input = new Input(source)
  let error = input.error('test', 11)

  is(error.input!.offset, 11)
  type(error.input!.endOffset, 'undefined')
  is('endOffset' in error.input!, false)
  is(sliceError(error), 'r')
})

test('Input#error accepts line and column', () => {
  let source = 'a {\n  color: red\n}'
  let input = new Input(source)
  let error = input.error('test', 2, 10)

  is(error.input!.offset, 13)
  type(error.input!.endOffset, 'undefined')
  is(error.input!.line, 2)
  is(error.input!.column, 10)
  is(sliceError(error), 'r')
})

test('Input#error accepts two objects with offsets', () => {
  let source = 'a { color: red }'
  let input = new Input(source)
  let error = input.error('test', { offset: 11 }, { offset: 14 })

  is(error.input!.offset, 11)
  is(error.input!.endOffset, 14)
  is(sliceError(error), 'red')
})

test('Input#error accepts two objects with line and column', () => {
  let source = 'a {\n  color: red\n}'
  let input = new Input(source)
  let error = input.error(
    'test',
    { column: 10, line: 2 },
    { column: 13, line: 2 }
  )

  is(error.input!.offset, 13)
  is(error.input!.endOffset, 16)
  is(sliceError(error), 'red')
})

test('Input#error with only start object has no endOffset', () => {
  let input = new Input('a { color: red }')
  let error = input.error('test', { offset: 11 })

  is(error.input!.offset, 11)
  type(error.input!.endOffset, 'undefined')
  is('endLine' in error.input!, false)
})

test('offset is inclusive and endOffset is exclusive', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration

  let error = decl.error('test', { word: 'red' })
  is(error.input!.offset, decl.source!.start!.offset + 7)
  is(error.input!.endOffset, error.input!.offset + 3)
  is(sliceError(error), 'red')
})

test('node error with index exposes offsets', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration
  let error = decl.error('test', { index: 1 })

  is(sliceError(error), 'o')
})

test('node error with start and end exposes offsets', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration
  let error = decl.error('test', {
    end: { column: 15, line: 1 },
    start: { column: 12, line: 1 }
  })

  is(error.input!.offset, 11)
  is(error.input!.endOffset, 14)
  is(sliceError(error), 'red')
})

test('node error without options exposes node range offsets', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let rule = root.first as Rule
  let error = rule.error('test')

  is(error.input!.offset, rule.source!.start!.offset)
  is(error.input!.endOffset, rule.source!.end!.offset)
  is(sliceError(error), 'a { color: red }')
})

test('offsets work with BOM at the start of the file', () => {
  let source = '﻿a { color: red }'
  let root = postcss.parse(source)
  let input = root.source!.input
  is(input.hasBOM, true)

  let error = input.error(
    'test',
    { column: 12, line: 1 },
    { column: 15, line: 1 }
  )
  is(error.input!.source, 'a { color: red }')
  is(error.input!.offset, 11)
  is(error.input!.endOffset, 14)
  is(sliceError(error), 'red')

  let decl = (root.first as Rule).first as Declaration
  let nodeError = decl.error('test', { word: 'red' })
  is(sliceError(nodeError), 'red')
})

test('offsets work with CRLF line endings', () => {
  let source = 'a {\r\n  color: red;\r\n}'
  let root = postcss.parse(source)
  let input = root.source!.input
  let decl = (root.first as Rule).first as Declaration

  let error = decl.error('test', { word: 'red' })
  is(error.line, 2)
  is(sliceError(error), 'red')

  let byLine = input.error(
    'test',
    { column: 10, line: 2 },
    { column: 13, line: 2 }
  )
  is(sliceError(byLine), 'red')
})

function mappedInput(css: string, original: string): Input {
  let generator = new SourceMapGenerator({ file: 'all.css' })
  generator.setSourceContent('b.css', original)
  for (let i = 0; i < css.length; i++) {
    generator.addMapping({
      generated: { column: i, line: 1 },
      original: { column: i, line: 1 },
      source: 'b.css'
    })
  }
  return new Input(css, {
    from: join(__dirname, 'build', 'all.css'),
    map: { prev: JSON.parse(generator.toString()) }
  })
}

test('top-level coordinates keep origin source with a source map', () => {
  let css = 'b { color: red }'
  let input = mappedInput(css, css)
  let red = css.indexOf('red')

  let error = input.error(
    'test',
    { offset: red },
    { offset: red + 3 }
  )

  is(error.file, join(__dirname, 'build', 'b.css'))
  is(error.line, 1)
  is(error.column, red + 1)
  is(error.endLine, 1)
  is(error.endColumn, red + 4)

  is(error.input!.source, css)
  is(error.input!.offset, red)
  is(error.input!.endOffset, red + 3)
  is(sliceError(error), 'red')
})

test('line/column errors with source map get CSS offsets', () => {
  let css = 'b { color: red }'
  let input = mappedInput(css, css)
  let red = css.indexOf('red')

  let error = input.error(
    'test',
    { column: red + 1, line: 1 },
    { column: red + 4, line: 1 }
  )

  is(error.input!.offset, red)
  is(error.input!.endOffset, red + 3)
  is(sliceError(error), 'red')
})

test('node warnings expose the same offset pair', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration
  let result = postcss.root().toResult()

  decl.warn(result, '颜色不在色板里', { word: 'red' })
  let warning = result.warnings()[0]

  is(warning.offset, 11)
  is(warning.endOffset, 14)
  is(source.slice(warning.offset, warning.endOffset), 'red')
})

test('node warnings expose node range offsets by default', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration
  let result = postcss.root().toResult()

  decl.warn(result, 'test')
  let warning = result.warnings()[0]

  is(warning.offset, decl.source!.start!.offset)
  is(warning.endOffset, decl.source!.end!.offset)
  is(source.slice(warning.offset, warning.endOffset), 'color: red')
})

test('warning without node has no offsets', () => {
  let warning = new postcss.Warning('text')
  type(warning.offset, 'undefined')
  type(warning.endOffset, 'undefined')
})

test('Input#toOffset is the inverse of fromOffset', () => {
  let source = 'a {\r\n  color: red;\n  b: c\r\n}'
  let input = new Input(source)

  for (let offset = 0; offset <= source.length; offset++) {
    let pos = input.fromOffset(offset)!
    is(input.toOffset(pos.line, pos.col), offset)
  }

  equal(input.toOffset(1, 1), 0)
  equal(input.toOffset(2, 1), 5)
})

test('Input#toOffset handles BOM', () => {
  let input = new Input('﻿a { color: red }')
  is(input.toOffset(1, 1), 0)
  is(input.toOffset(1, 12), 11)
})

test('third-party syntax without offsets still errors and warns', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration
  delete (decl.source!.start as { offset?: number }).offset
  delete (decl.source!.end as { offset?: number }).offset

  // Must not throw or produce NaN; coordinates keep the old line/col result
  let error = decl.error('test', { word: 'red' })
  is(Number.isNaN(error.input!.offset), false)
  is(Number.isNaN(error.input!.endOffset), false)
  is(error.line, 1)
  is(error.column, 5)
  is(error.endColumn, 15)
  is(sliceError(error), 'color: red')

  let result = postcss.root().toResult()
  decl.warn(result, 'test', { word: 'red' })
  let warning = result.warnings()[0]
  is(Number.isNaN(warning.offset), false)
  is(Number.isNaN(warning.endOffset), false)
  is(source.slice(warning.offset, warning.endOffset), 'color: red')
})

test('third-party syntax node without end and offsets works', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let rule = root.first as Rule
  delete (rule.source!.start as { offset?: number }).offset
  rule.source!.end = undefined

  let error = rule.error('test')
  is(Number.isNaN(error.input!.offset), false)
  is(sliceError(error), 'a')

  let result = postcss.root().toResult()
  rule.warn(result, 'test')
  let warning = result.warnings()[0]
  is(Number.isNaN(warning.offset), false)
  is(source.slice(warning.offset, warning.endOffset), 'a')
})

test('message, top-level coordinates and source code stay unchanged', () => {
  let source = 'a { color: red }'
  let root = postcss.parse(source)
  let decl = (root.first as Rule).first as Declaration

  let error = decl.error('Bad color', { plugin: 'p', word: 'red' })
  is(error.message, 'p: <css input>:1:12: Bad color')
  is(error.line, 1)
  is(error.column, 12)
  is(error.endLine, 1)
  is(error.endColumn, 15)
  is(
    error.showSourceCode(false),
    '> 1 | a { color: red }\n    |            ^'
  )
})

test.run()
