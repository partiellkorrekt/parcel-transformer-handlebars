import fs from 'node:fs'
import path from 'node:path'
import { Transformer } from '@parcel/plugin'
import frontMatter from 'front-matter'
import glob from 'glob'
import Handlebars from 'handlebars'
import handlebarsHelpers from 'handlebars-helpers'
import handlebarsLayouts from 'handlebars-layouts'
import handlebarsWax from 'handlebars-wax'

type HandlebarsConfig = {
  layouts: string | string[]
  partials: string | string[]
  helpers: string | string[]
  data: string | string[]
  decorators: string | string[]
}

const defaultConfig: HandlebarsConfig = {
  data: 'src/markup/data',
  decorators: 'src/markup/decorators',
  helpers: 'src/markup/helpers',
  layouts: 'src/markup/layouts',
  partials: 'src/markup/partials',
}

function toArray<T>(value: T | T[] | undefined) {
  if (typeof value === 'undefined') {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

const parseSimpleLayout = (str: string, opts: HandlebarsConfig) => {
  const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/
  const matches = str.match(layoutPattern)

  if (matches) {
    const layout = matches[1]

    for (const layoutPath of toArray(opts.layouts)) {
      const filenameBase = path.resolve(layoutPath, layout)
      for (const ext of ['.hbs', '.handlebars']) {
        const filename = filenameBase + ext
        if (fs.existsSync(filename)) {
          const content = fs.readFileSync(filename, { encoding: 'utf-8' })
          return {
            dependencies: [filename],
            content: content.replace('{{{body}}}', str),
          }
        }
      }
    }
  }

  return { dependencies: [], content: str }
}

export default new Transformer<HandlebarsConfig>({
  async loadConfig({ config }) {
    const configFile = await config.getConfig(
      [
        'handlebars.config.js',
        'handlebars.config.json',
        'hbs.config.js',
        'hbs.config.json',
      ],
      {},
    )

    if (configFile) {
      const isJS = path.extname(configFile.filePath) === '.js'
      if (isJS) {
        config.invalidateOnStartup()
      }

      return {
        ...defaultConfig,
        ...(configFile.contents as Partial<HandlebarsConfig>),
      }
    }

    return defaultConfig
  },

  async transform({ asset, config }) {
    const wax = handlebarsWax(Handlebars)
    wax.helpers(handlebarsHelpers)
    wax.helpers(handlebarsLayouts)
    toArray(config.helpers).map((x) => wax.helpers(`${x}/**/*.js`))
    toArray(config.data).map((x) => wax.data(`${x}/**/*.{json,js}`))
    toArray(config.decorators).map((x) => wax.decorators(`${x}/**/*.js`))
    toArray(config.layouts).map((x) =>
      wax.partials(`${x}/**/*.{hbs,handlebars,js}`),
    )
    toArray(config.partials).map((x) =>
      wax.partials(`${x}/**/*.{hbs,handlebars,js}`),
    )

    const dependencies: string[] = [
      toArray(config.helpers).map((x) => `${x}/**/*.js`),
      toArray(config.data).map((x) => `${x}/**/*.{json,js}`),
      toArray(config.decorators).map((x) => `${x}/**/*.js`),
      toArray(config.layouts).map((x) => `${x}/**/*.{hbs,handlebars,js}`),
      toArray(config.partials).map((x) => `${x}/**/*.{hbs,handlebars,js}`),
    ]
      .flat()
      .flatMap((g) => glob.sync(g))

    const code = await asset.getCode()

    // process any frontmatter yaml in the template file
    const frontmatter = frontMatter(code)

    // process simple layout mapping that does not use handlebars-layouts. i.e {{!< base}}
    const { dependencies: layoutDeps, content } = parseSimpleLayout(
      frontmatter.body,
      config,
    )
    dependencies.push(...layoutDeps)

    for (const dep of dependencies) {
      asset.invalidateOnFileChange(dep)
    }

    // combine frontmatter data with NODE_ENV variable for use in the template
    const data = Object.assign({}, frontmatter.attributes, {
      NODE_ENV: process.env.NODE_ENV,
    })

    // compile template into html markup and assign it to this.contents. super.generate() will use this variable.
    const result = wax.compile(content)(data)

    asset.type = 'html'
    asset.setCode(result)

    return [asset]
  },
})
