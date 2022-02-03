const chalk = require('chalk');
const render = require('template-file').render;
const util = require('../common/utils');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

async function generatePage(...args) {
  let schematic = args[0];
  const argument = args[1];
  switch (schematic) {
    case 'page':
      let outputFile = args[2];
      const pageName = util.classNameFromHyphens(path.basename(outputFile));
      console.log(
          chalk.cyanBright('*') + ' Generating',
          chalk.yellow.bold(schematic),
          argument, '→',
          outputFile
      );
      const componentTemplate = './templates/page/' + argument + '.md';
      if (fs.existsSync(componentTemplate)) {
        let pageTemplate = fs.readFileSync(componentTemplate).toString('utf8');
        pageTemplate = render(pageTemplate, {name: pageName});
        const outputPath = path.join('./source/pages/', outputFile, '..');
        outputFile = path.join('./source/pages/', outputFile + '.md');
        if (!fs.existsSync(outputFile)) {
          mkdirp.sync(outputPath);
          fs.writeFileSync(outputFile, pageTemplate);
          console.log(chalk.cyanBright('*') + ' NEW page:', chalk.green.bold(outputFile));
        } else {
          console.error(
              chalk.red.bold('A file with that name already exists.')
          );
        }
      } else {
        console.error(
            chalk.red.bold('Invalid page template:', componentTemplate)
        );
      }
      break;
    case 'component':
    case 'controller':
    case 'template':
      const className = util.classNameFromHyphens(argument);
      console.log(
          chalk.cyanBright('*') + ' Generating',
          chalk.yellow.bold(schematic),
          argument, '→',
          chalk.green.bold(className)
      );
      // check first if already exists
      const componentId = `${schematic}s/${argument}`;
      // TODO: read "./source/app/" from `./config/default-production.json`
      const destinationName = `./source/app/${componentId}.`;
      if (fs.existsSync(destinationName + 'js') || fs.existsSync(destinationName + 'css') || fs.existsSync(destinationName + 'html')) {
        console.error(
            chalk.red.bold('A file with that name already exists.')
        );
      } else {
        const componentTemplate = './templates/component/component.';
        let css = fs.readFileSync(componentTemplate + 'css').toString('utf8');
        let html = fs.readFileSync(componentTemplate + 'html').toString('utf8');
        let js = fs.readFileSync(componentTemplate + 'js').toString('utf8');
        if (schematic === 'component' || schematic === 'template') {
          html = render(html, {name: className});
          fs.writeFileSync(destinationName + 'html', html);
          console.log('-', chalk.yellow('added'), destinationName + 'html');
          css = render(css, {name: className});
          fs.writeFileSync(destinationName + 'css', css);
          console.log('-', chalk.yellow('added'), destinationName + 'css');
        }
        if (schematic === 'component' || schematic === 'controller') {
          js = render(js, {name: className});
          fs.writeFileSync(destinationName + 'js', js);
          console.log('-', chalk.yellow('added'), destinationName + 'js');
        }
        console.log(chalk.cyanBright('*') + ' NEW componentId:', chalk.green.bold(componentId));
      }
      break;
    default:
      console.log(
          chalk.yellow.bold('Unknown schematic name.')
      );
  }
}

module.exports = generatePage;
