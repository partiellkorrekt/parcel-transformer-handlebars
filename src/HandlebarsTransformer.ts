import path from 'path'
import fs from 'fs'
import { Transformer } from '@parcel/plugin'
import Handlebars from 'handlebars'
import handlebarsWax from 'handlebars-wax'
import handlebarsLayouts from 'handlebars-layouts'
import handlebarsHelpers from 'handlebars-helpers'
import frontMatter from 'front-matter'
import glob from 'glob'

type HandlebarsConfig = {
  layouts?: string,
  partials?: string,
  helpers?: string,
  data?: string,
  decorators?: string
}

const parseSimpleLayout = (str: string, opts: HandlebarsConfig) => {
  const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/;
  const matches = str.match(layoutPattern);

  if (matches) {
    let layout = matches[1];

    if (opts.layouts && layout[0] !== '.') {
      layout = path.resolve(opts.layouts, layout);
    }

    const hbsLayout = path.resolve(process.cwd(), `${layout}.hbs`);

    if (fs.existsSync(hbsLayout)) {
      const content = fs.readFileSync(hbsLayout, { encoding: 'utf-8' });
      return { dependencies: [hbsLayout], content: content.replace('{{{body}}}', str) };
    }

    const handlebarsLayout = hbsLayout.replace('.hbs', '.handlebars');

    if (fs.existsSync(handlebarsLayout)) {
      const content = fs.readFileSync(handlebarsLayout, { encoding: 'utf-8' });
      return { dependencies: [handlebarsLayout], content: content.replace('{{{body}}}', str) };
    }
  }

  return { dependencies: [], content: str };
};

export default (new Transformer<HandlebarsConfig>({
  async loadConfig({config}) {
    const configFile = await config.getConfig([
      'handlebars.config.js',
      'handlebars.config.json',
      'hbs.config.js',
      'hbs.config.json'
    ], {})

    if (configFile) {
      const isJS = path.extname(configFile.filePath) === '.js'
      if (isJS) {
        config.invalidateOnStartup()
      }

      return (configFile.contents ?? {}) as HandlebarsConfig
    }

    return {}
  },

  async transform({asset, config}) {
    const wax = handlebarsWax(Handlebars)
    wax.helpers(handlebarsLayouts)
    wax.helpers(handlebarsHelpers)
    const dependencies: string[] = []
    if (config.helpers) {
      dependencies.push(...glob.sync(`${config.helpers}/**/*.js`))
      wax.helpers(`${config.helpers}/**/*.js`)
    }
    if (config.data) {
      dependencies.push(...glob.sync(`${config.data}/**/*.{json,js}`))
      wax.data(`${config.data}/**/*.{json,js}`)
    }
    if (config.decorators) {
      dependencies.push(...glob.sync(`${config.decorators}/**/*.js`))
      wax.decorators(`${config.decorators}/**/*.js`)
    }
    if (config.layouts) {
      dependencies.push(...glob.sync(`${config.layouts}/**/*.{hbs,handlebars,js}`))
      wax.partials(`${config.layouts}/**/*.{hbs,handlebars,js}`)
    }
    if (config.partials) {
      dependencies.push(...glob.sync(`${config.partials}/**/*.{hbs,handlebars,js}`))
      wax.partials(`${config.partials}/**/*.{hbs,handlebars,js}`);
    }

    const code = await asset.getCode()

    // process any frontmatter yaml in the template file
    const frontmatter = frontMatter(code)

    // process simple layout mapping that does not use handlebars-layouts. i.e {{!< base}}
    const { dependencies: layoutDeps, content } = parseSimpleLayout(frontmatter.body, config);
    dependencies.push(...layoutDeps)

    for (const dep of dependencies) {
      asset.invalidateOnFileChange(dep)
    }

    // combine frontmatter data with NODE_ENV variable for use in the template
    const data = Object.assign({}, frontmatter.attributes, { NODE_ENV: process.env.NODE_ENV });

    // compile template into html markup and assign it to this.contents. super.generate() will use this variable.
    const result = wax.compile(content)(data);

    asset.type = 'html'
    asset.setCode(result)

    return [asset]
  }
}))
