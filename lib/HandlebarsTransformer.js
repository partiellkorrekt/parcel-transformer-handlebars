"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const plugin_1 = require("@parcel/plugin");
const front_matter_1 = __importDefault(require("front-matter"));
const glob_1 = __importDefault(require("glob"));
const handlebars_1 = __importDefault(require("handlebars"));
const handlebars_helpers_1 = __importDefault(require("handlebars-helpers"));
const handlebars_layouts_1 = __importDefault(require("handlebars-layouts"));
const handlebars_wax_1 = __importDefault(require("handlebars-wax"));
const defaultConfig = {
    data: 'src/markup/data',
    decorators: 'src/markup/decorators',
    helpers: 'src/markup/helpers',
    layouts: 'src/markup/layouts',
    partials: 'src/markup/partials',
};
function toArray(value) {
    if (typeof value === 'undefined') {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
const parseSimpleLayout = (str, opts) => {
    const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/;
    const matches = str.match(layoutPattern);
    if (matches) {
        const layout = matches[1];
        for (const layoutPath of toArray(opts.layouts)) {
            const filenameBase = node_path_1.default.resolve(layoutPath, layout);
            for (const ext of ['.hbs', '.handlebars']) {
                const filename = filenameBase + ext;
                if (node_fs_1.default.existsSync(filename)) {
                    const content = node_fs_1.default.readFileSync(filename, { encoding: 'utf-8' });
                    return {
                        dependencies: [filename],
                        content: content.replace('{{{body}}}', str),
                    };
                }
            }
        }
    }
    return { dependencies: [], content: str };
};
exports.default = new plugin_1.Transformer({
    async loadConfig({ config }) {
        const configFile = await config.getConfig([
            'handlebars.config.js',
            'handlebars.config.json',
            'hbs.config.js',
            'hbs.config.json',
        ], {});
        if (configFile) {
            const isJS = node_path_1.default.extname(configFile.filePath) === '.js';
            if (isJS) {
                config.invalidateOnStartup();
            }
            return {
                ...defaultConfig,
                ...configFile.contents,
            };
        }
        return defaultConfig;
    },
    async transform({ asset, config }) {
        const wax = (0, handlebars_wax_1.default)(handlebars_1.default);
        wax.helpers(handlebars_helpers_1.default);
        wax.helpers(handlebars_layouts_1.default);
        toArray(config.helpers).map((x) => wax.helpers(`${x}/**/*.js`));
        toArray(config.data).map((x) => wax.data(`${x}/**/*.{json,js}`));
        toArray(config.decorators).map((x) => wax.decorators(`${x}/**/*.js`));
        toArray(config.layouts).map((x) => wax.partials(`${x}/**/*.{hbs,handlebars,js}`));
        toArray(config.partials).map((x) => wax.partials(`${x}/**/*.{hbs,handlebars,js}`));
        const dependencies = [
            toArray(config.helpers).map((x) => `${x}/**/*.js`),
            toArray(config.data).map((x) => `${x}/**/*.{json,js}`),
            toArray(config.decorators).map((x) => `${x}/**/*.js`),
            toArray(config.layouts).map((x) => `${x}/**/*.{hbs,handlebars,js}`),
            toArray(config.partials).map((x) => `${x}/**/*.{hbs,handlebars,js}`),
        ]
            .flat()
            .flatMap((g) => glob_1.default.sync(g));
        const code = await asset.getCode();
        // process any frontmatter yaml in the template file
        const frontmatter = (0, front_matter_1.default)(code);
        // process simple layout mapping that does not use handlebars-layouts. i.e {{!< base}}
        const { dependencies: layoutDeps, content } = parseSimpleLayout(frontmatter.body, config);
        dependencies.push(...layoutDeps);
        for (const dep of dependencies) {
            asset.invalidateOnFileChange(dep);
        }
        // combine frontmatter data with NODE_ENV variable for use in the template
        const data = Object.assign({}, frontmatter.attributes, {
            NODE_ENV: process.env.NODE_ENV,
        });
        // compile template into html markup and assign it to this.contents. super.generate() will use this variable.
        const result = wax.compile(content)(data);
        asset.type = 'html';
        asset.setCode(result);
        return [asset];
    },
});
//# sourceMappingURL=HandlebarsTransformer.js.map