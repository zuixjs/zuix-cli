/*
 * Copyright 2020-2022 G-Labs. All Rights Reserved.
 *         https://zuixjs.github.io/zuix
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 *
 *  This file is part of
 *  zUIx, Javascript library for component-based development.
 *        https://zuixjs.github.io/zuix
 *
 * @author Generoso Martello <generoso@martello.com>
 */

const fs = require('fs');
const path = require("path");
const http = require('https');
const extractZip = require("extract-zip");
const merge = require('deepmerge');
const utils = require('../common/utils');

function newProject(name) {
  const folder = name;
  if (fs.existsSync('package.json') || fs.existsSync('node_modules')) {
    console.log(utils.chalk.red.bold('Cannot create a new site inside a folder of another project.'));
    return;
  }
  if (!fs.existsSync(folder)) {
    utils.mkdirp.sync(folder);
    console.debug('- %s "%s"', utils.chalk.blue.bold('created folder'), folder);
    const templateName = 'zuix-web-starter';
    const templatePath = 'https://codeload.github.com/zuixjs/' + templateName + '/zip/refs/heads/master';
    const zipFile = path.join(folder, 'web-starter.zip');
    const file = fs.createWriteStream(zipFile);
    console.debug('- %s', utils.chalk.blue('downloading web-starter'));
    http.get(templatePath, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close(async () => {
          console.log('- %s', utils.chalk.blue('extracting'));
          await extractZip(zipFile, {dir: path.resolve(folder)}).then(() => {
            fs.unlinkSync(zipFile);
            console.log('- %s', utils.chalk.blue('copying files'));
            const templateFolder = path.join(folder, templateName + '-master');
            if (!utils.copyFolder(templateFolder, name, () => {
              fs.rmSync(templateFolder, { recursive: true });

              // replace project 'name' in config/*.json and packages.json
              const appConfig = {
                zuix: {
                  app: {
                    title: name,
                    subtitle: 'A new awesome website!'
                  }
                }
              };
              updateConfigFile(path.resolve(name, 'config', 'default.json'), appConfig);
              updateConfigFile(path.resolve(name, 'config', 'production.json'), appConfig);
              updateConfigFile(path.resolve(name, 'package.json'), {
                name, version: '1.0.0', description: appConfig.description
              }, [ 'keywords', 'author', 'homepage', 'repository', 'bugs' ]);

              console.log('- %s', utils.chalk.blue('installing packages'));
              npmInstall(name);
              console.log(utils.chalk.green.bold('Done!'));
            })) {
              console.log(utils.chalk.red.bold('Error!'));
            }
          });
        });
      });
    }).on('error', function(err) {
      // TODO: report error
    });

  } else {
    console.log(utils.chalk.red.bold('A folder with that name already exists!'));
  }
}

function updateConfigFile(configFile, data, deleteKeys) {
  const config = require(configFile);
  if (deleteKeys) {
    deleteKeys.forEach(k => delete config[k]);
  }
  fs.writeFileSync(configFile, JSON.stringify(merge(config, data), null, 2));
}

function npmInstall(projectPath) {
  const child_process = require('child_process');
  child_process.execSync('npm install',{
    stdio:[0, 1, 2],
    cwd: projectPath
  });
}

module.exports = newProject;
