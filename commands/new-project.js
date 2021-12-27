const chalk = require('chalk');
const path = require("path");
const utils = require('../common/utils');

function newProject(name) {
  const templatePath = path.resolve(__dirname, '../starters/eleventy');
  if (!utils.copyFolder(templatePath, name, () => {
    // TODO: should replace '%name%' with project
    //       name in `packages.json' config
    npmInstall(name);
    console.log(chalk.green.bold('Done!'));
  })) {
    console.log(chalk.red.bold('Error!'));
  }
}

function npmInstall(projectPath) {
  const child_process = require('child_process');
  child_process.execSync('npm install',{
    stdio:[0, 1, 2],
    cwd: projectPath
  });
}

module.exports = newProject;
