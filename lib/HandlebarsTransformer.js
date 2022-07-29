"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const plugin_1 = require("@parcel/plugin");
const handlebars_1 = __importDefault(require("handlebars"));
const handlebars_wax_1 = __importDefault(require("handlebars-wax"));
const handlebars_layouts_1 = __importDefault(require("handlebars-layouts"));
const handlebars_helpers_1 = __importDefault(require("handlebars-helpers"));
const front_matter_1 = __importDefault(require("front-matter"));
const glob_1 = __importDefault(require("glob"));
const parseSimpleLayout = (str, opts) => {
    const layoutPattern = /{{!<\s+([A-Za-z0-9._\-/]+)\s*}}/;
    const matches = str.match(layoutPattern);
    if (matches) {
        let layout = matches[1];
        if (opts.layouts && layout[0] !== '.') {
            layout = path_1.default.resolve(opts.layouts, layout);
        }
        const hbsLayout = path_1.default.resolve(process.cwd(), `${layout}.hbs`);
        if (fs_1.default.existsSync(hbsLayout)) {
            const content = fs_1.default.readFileSync(hbsLayout, { encoding: 'utf-8' });
            return { dependencies: [hbsLayout], content: content.replace('{{{body}}}', str) };
        }
        const handlebarsLayout = hbsLayout.replace('.hbs', '.handlebars');
        if (fs_1.default.existsSync(handlebarsLayout)) {
            const content = fs_1.default.readFileSync(handlebarsLayout, { encoding: 'utf-8' });
            return { dependencies: [handlebarsLayout], content: content.replace('{{{body}}}', str) };
        }
    }
    return { dependencies: [], content: str };
};
exports.default = (new plugin_1.Transformer({
    async loadConfig({ config }) {
        const configFile = await config.getConfig([
            'handlebars.config.js',
            'handlebars.config.json',
            'hbs.config.js',
            'hbs.config.json'
        ], {});
        if (configFile) {
            const isJS = path_1.default.extname(configFile.filePath) === '.js';
            if (isJS) {
                config.invalidateOnStartup();
            }
            return (configFile.contents ?? {});
        }
        return {};
    },
    async transform({ asset, config }) {
        const wax = (0, handlebars_wax_1.default)(handlebars_1.default);
        wax.helpers(handlebars_layouts_1.default);
        wax.helpers(handlebars_helpers_1.default);
        const dependencies = [];
        if (config.helpers) {
            dependencies.push(...glob_1.default.sync(`${config.helpers}/**/*.js`));
            wax.helpers(`${config.helpers}/**/*.js`);
        }
        if (config.data) {
            dependencies.push(...glob_1.default.sync(`${config.data}/**/*.{json,js}`));
            wax.data(`${config.data}/**/*.{json,js}`);
        }
        if (config.decorators) {
            dependencies.push(...glob_1.default.sync(`${config.decorators}/**/*.js`));
            wax.decorators(`${config.decorators}/**/*.js`);
        }
        if (config.layouts) {
            dependencies.push(...glob_1.default.sync(`${config.layouts}/**/*.{hbs,handlebars,js}`));
            wax.partials(`${config.layouts}/**/*.{hbs,handlebars,js}`);
        }
        if (config.partials) {
            dependencies.push(...glob_1.default.sync(`${config.partials}/**/*.{hbs,handlebars,js}`));
            wax.partials(`${config.partials}/**/*.{hbs,handlebars,js}`);
        }
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
        const data = Object.assign({}, frontmatter.attributes, { NODE_ENV: process.env.NODE_ENV });
        // compile template into html markup and assign it to this.contents. super.generate() will use this variable.
        const result = wax.compile(content)(data);
        asset.type = 'html';
        asset.setCode(result);
        return [asset];
    }
}));
//# sourceMappingURL=HandlebarsTransformer.js.map