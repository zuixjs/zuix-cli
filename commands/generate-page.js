const chalk = require('chalk');
const renderToFolder = require('template-file').renderToFolder;

async function generatePage(...args) {
  const schematic = args[0];
  const argument = args[1];
  switch (schematic) {
    case 'page':
      break;
    case 'component':
      console.log(
          chalk.yellow.bold(schematic),
          argument
      );
      // TODO: check first if already exists
      await renderToFolder('./templates/component/component.*', `./source/app/components/${argument}`, {
        name: argument
      }).then(()=>{
        // TODO: ...
      });
      break;
    default:
      console.log(
          chalk.yellow.bold('Unknown schematic name')
      );
  }
}

module.exports = generatePage;
