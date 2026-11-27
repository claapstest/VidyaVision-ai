import { execSync } from 'child_process'
import { createWriteStream, existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join, relative, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')
const RELEASE = join(ROOT, 'release')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version || '0.0.0'
const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const zipName = `vidyavision-frontend-v${version}-${timestamp}.zip`

const EXCLUDE_PATTERNS = [
  /\.map$/,
  /\.ts$/,
  /\.jsx$/,
  /\.tsx$/,
  /\.env/,
  /node_modules/,
  /\.git/,
  /\.DS_Store/,
  /Thumbs\.db/,
]

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(p => p.test(filePath))
}

function getFilesRecursive(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(DIST, full)
    if (shouldExclude(rel)) continue
    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(full))
    } else {
      files.push(full)
    }
  }
  return files
}

console.log(`\n=== VidyaVision Frontend Packager ===`)
console.log(`Version: ${version}`)
console.log(`Output:  ${zipName}\n`)

if (!existsSync(DIST)) {
  console.error('ERROR: dist/ directory not found. Run "npm run build:frontend" first.')
  process.exit(1)
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('ERROR: dist/index.html not found. Build may have failed.')
  process.exit(1)
}

const files = getFilesRecursive(DIST)
console.log(`Files to package: ${files.length}`)

const excluded = []
function checkExcluded(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(DIST, full)
    if (shouldExclude(rel)) {
      excluded.push(rel)
    } else if (entry.isDirectory()) {
      checkExcluded(full)
    }
  }
}
checkExcluded(DIST)
if (excluded.length > 0) {
  console.log(`Excluded: ${excluded.join(', ')}`)
}

execSync(`powershell -Command "New-Item -ItemType Directory -Force -Path '${RELEASE}'" `, { stdio: 'pipe' })

const zipPath = join(RELEASE, zipName)
if (existsSync(zipPath)) {
  execSync(`powershell -Command "Remove-Item -Force '${zipPath}'"`, { stdio: 'pipe' })
}

execSync(
  `powershell -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force"`,
  { stdio: 'inherit' }
)

const zipStat = statSync(zipPath)
const sizeMB = (zipStat.size / 1024 / 1024).toFixed(2)

console.log(`\n=== Package Complete ===`)
console.log(`Artifact: ${zipName}`)
console.log(`Size:     ${sizeMB} MB`)
console.log(`Path:     ${zipPath}`)

const topLevel = readdirSync(DIST).filter(f => !shouldExclude(f))
console.log(`\nZIP root contents:`)
topLevel.forEach(f => {
  const full = join(DIST, f)
  const isDir = statSync(full).isDirectory()
  console.log(`  ${isDir ? '[DIR]' : '     '} ${f}`)
})

if (topLevel.includes('index.html')) {
  console.log(`\n✓ index.html is at ZIP root (not nested in a subfolder)`)
} else {
  console.error(`\n✗ WARNING: index.html is NOT at ZIP root!`)
}

console.log(`\nVersion: ${version}`)
console.log(`Artifact: ${zipName}`)
