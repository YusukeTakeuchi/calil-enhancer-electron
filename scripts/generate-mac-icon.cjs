const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const source = path.join(projectRoot, 'build', 'icon.png')
const output = path.join(projectRoot, 'build', 'icon.icns')
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'calil-enhancer-icon-'))

const representations = [
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]

try {
  const entries = representations.map(([type, size], index) => {
    const pngPath = path.join(temporaryDirectory, `${index}-${size}.png`)
    execFileSync('sips', ['-z', String(size), String(size), source, '--out', pngPath], { stdio: 'ignore' })
    const png = fs.readFileSync(pngPath)
    const entry = Buffer.alloc(8 + png.length)
    entry.write(type, 0, 4, 'ascii')
    entry.writeUInt32BE(entry.length, 4)
    png.copy(entry, 8)
    return entry
  })

  const length = 8 + entries.reduce((total, entry) => total + entry.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(length, 4)
  fs.writeFileSync(output, Buffer.concat([header, ...entries], length))
  console.log(`Generated ${output}`)
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
