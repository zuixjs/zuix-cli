const chalk = require('chalk');
const path = require("path");
const utils = require('../common/utils');
const extractZip = require("extract-zip");
const http = require('https');
const fs = require('fs');
const mkdirp = require("mkdirp");
const render = require('template-file').render;

function newProject(name) {
  const folder = name;
  if (!fs.existsSync(folder)) {
    mkdirp.sync(folder);
    console.debug('- %s "%s"', chalk.blue.bold('created folder'), folder);
    const templateName = 'zuix-web-starter';
    const templatePath = 'https://codeload.github.com/zuixjs/' + templateName + '/zip/refs/heads/master';
    const zipFile = path.join(folder, 'web-starter.zip');
    const file = fs.createWriteStream(zipFile);
    console.debug('- %s', chalk.blue('downloading web-starter'));
    http.get(templatePath, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(async () => {
          console.log('- %s', chalk.blue('extracting'));
          await extractZip(zipFile, {dir: path.resolve(folder)}).then(() => {
            fs.unlinkSync(zipFile);
            console.log('- %s', chalk.blue('copying files'));
            const templateFolder = path.join(folder, templateName + '-master');
            if (!utils.copyFolder(templateFolder, name, () => {
              fs.rmSync(templateFolder, { recursive: true });

              // TODO: should replace '%name%' with project
              //       name in `packages.json' config

              console.log('- %s', chalk.blue('installing packages'));
              npmInstall(name);
              console.log(chalk.green.bold('Done!'));
            })) {
              console.log(chalk.red.bold('Error!'));
            }
          });
        });
      });
    }).on('error', function(err) {
      // TODO: report error
    });

  } else {
    console.log(chalk.red.bold('A folder with that name already exists!'));
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
