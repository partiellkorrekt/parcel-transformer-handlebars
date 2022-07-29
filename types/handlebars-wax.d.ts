declare module 'handlebars-wax' {
  class Wax {
    helpers(dir: string): Wax
    partials(dir: string): Wax
    decorators(dir: string): Wax
    data(dir: string): Wax
    compile(template: string): ((data: unknown) => string)
  }

  const handlebarsWax: (hbs: typeof Handlebars) => Wax
  export default handlebarsWax
}
