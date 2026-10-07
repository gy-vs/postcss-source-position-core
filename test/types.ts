import postcss, {
  Declaration,
  Document,
  PluginCreator,
  Rule
} from '../lib/postcss.js'

const plugin: PluginCreator<string> = prop => {
  return {
    Declaration: (decl, { Comment, result }) => {
      if (decl.prop === prop) {
        decl.warn(result, `${decl.prop} found in ${decl.parent?.nodes.length}`)
        decl.replaceWith(new Comment({ text: `${decl.prop} removed` }))
      }
    },
    postcssPlugin: 'remover'
  }
}

plugin.postcss = true

postcss([plugin])
  .process('h1{color: black;}', {
    from: undefined
  })
  .then(result => {
    console.log(result.root.parent)
    console.log(result.css)
  })

function parseMarkdown(): Document {
  return new Document()
}

let doc = postcss().process('a{}', { parser: parseMarkdown }).root
console.log(doc.toString())

// Offsets in errors
let errorRoot = postcss.parse('a { color: red }')
let errorDecl = (errorRoot.first as Rule).first as Declaration
errorDecl.error('颜色不在色板里', { word: 'red' }).input!.offset.toFixed(0)

function checkErrorOffsets(): void {
  let root = postcss.parse('a { color: red }')
  let input = root.source!.input

  let error = input.error('test', 5)
  let start: number = error.input!.offset
  let end: number | undefined = error.input!.endOffset
  console.log(start, end)

  let ranged = input.error('test', { offset: 10 }, { offset: 13 })
  console.log(ranged.input!.offset, ranged.input!.endOffset)

  let byLine = input.error('test', { column: 1, line: 1 })
  console.log(byLine.input!.offset)

  let offset: number = input.toOffset(1, 1)
  console.log(offset)
  let back: { col: number; line: number } | null = input.fromOffset(0)
  console.log(back)
}
checkErrorOffsets()

// Offsets in warnings
function checkWarningOffsets(): void {
  let root = postcss.parse('a { color: red }')
  let result = postcss.root().toResult()
  let decl = (root.first as Rule).first as Declaration
  decl.warn(result, 'bad color', { word: 'red' })
  let warning = result.warnings()[0]
  let start: number | undefined = warning.offset
  let end: number | undefined = warning.endOffset
  console.log(start, end)
}
checkWarningOffsets()

export default plugin
