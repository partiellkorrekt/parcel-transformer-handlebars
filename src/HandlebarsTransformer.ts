import path from 'path'
import fs from 'fs'
import { Transformer } from '@parcel/plugin'
import Handlebars from 'handlebars'
import handlebarsWax from 'handlebars-wax'
import handlebarsLayouts from 'handlebars-layouts'
import handlebarsHelpers from 'handlebars-helpers'
import frontMatter from 'front-matter'

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
    if (config.helpers) {
      wax.helpers(`${config.helpers}/**/*.js`)
    }
    if (config.data) {
      wax.data(`${config.data}/**/*.{json,js}`)
    }
    if (config.decorators) {
      wax.decorators(`${config.decorators}/**/*.js`)
    }
    if (config.layouts) {
      wax.partials(`${config.layouts}/**/*.{hbs,handlebars,js}`)
    }
    if (config.partials) {
      wax.partials(`${config.partials}/**/*.{hbs,handlebars,js}`);
    }

    const code = await asset.getCode()

    // process any frontmatter yaml in the template file
    const frontmatter = frontMatter(code)

    // process simple layout mapping that does not use handlebars-layouts. i.e {{!< base}}
    const { dependencies, content } = parseSimpleLayout(frontmatter.body, config);

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
