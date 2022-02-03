#! /usr/bin/env node
const {program, Option, Argument} = require('commander');
const newProject = require('./commands/new-project');
const generatePage = require('./commands/generate-page');
const generateComponent = require('./commands/generate-component');
const compilePage = require('./commands/compile-page');

program
    .command('new <project_name>')
    .description('Create a new zUIx site')
    .action(newProject);

program
    .command('generate')
    .alias('g')
    .addArgument(new Argument('<schematic>', 'The schematic to generate')
        .choices(['page', 'component', 'controller', 'template']))
    .addArgument(new Argument('[options]', 'Schematic options'))
    .addArgument(new Argument('[options]', 'Schematic options'))
    .description('Generates and/or modifies files based on a schematic')
    .action(generatePage);
/*
program
    .command('gp <page_name>')
    .description('Add a new page using the default template')
    .action((...args) => generatePage('page', ...args));

program
    .command('"gc" <component_name>')
    .description('Add a new component')
    .action((...args) => generatePage('component', ...args));

program
    .command('gc')
    .alias('generate-component')
    .description('Add a new component')
    .action(generateComponent);
*/
program
  .command('compile <inputFile> [outputFile] [pathPrefix]')
  .alias('c')
  .description('Compile a page')
  .action(compilePage);

program.showSuggestionAfterError();

program.parse();

module.exports = {
  newProject, generatePage, generateComponent, compilePage
}
