// Regenerates src/app/pages/licenses.json (the Open-source licenses page) from the license field of each
// runtime dependency in package.json. Run with `npm run licenses` after `npm ci` when dependencies change.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }
const rows = Object.keys(pkg.dependencies)
  .sort()
  .map((name) => {
    const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string; license?: string; homepage?: string; repository?: string | { url?: string } }
    const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url
    const url = (p.homepage ?? repo ?? '').replace(/^git\+/, '').replace(/\.git$/, '')
    return { name, version: p.version, license: p.license ?? 'unknown', url: url.startsWith('https://') ? url : '' }
  })
writeFileSync('src/app/pages/licenses.json', JSON.stringify(rows, null, 2) + '\n')
console.log(`wrote ${rows.length} packages`)
