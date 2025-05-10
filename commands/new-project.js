/*
 * Copyright 2020-2025 G-Labs. All Rights Reserved.
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
 * @author Generoso Martello - https://github.com/genemars
 */

const fs = require('fs');
const path = require('path');
const http = require('https');
const extractZip = require('extract-zip');
const merge = require('deepmerge');
const chalk = require('chalk');
const mkdirp = require('mkdirp');
const {copyFolder} = require('../common/utils');
const githubApiUserAgent = 'ZUIX-Project-Starter/1.1';
const githubApiVersionAccept = 'application/vnd.github.v3+json';

function newProject(projectName, templateName) {
  if (fs.existsSync(projectName)) {
    console.log(chalk.red.bold('A folder with that name already exists!'));
    return;
  }
  if (fs.existsSync('package.json') || fs.existsSync('node_modules')) {
    console.log(chalk.red.bold('Cannot create a new site inside a folder of another project.'));
    return;
  }
  templateName = templateName.t || 'zuix-web-starter';
  const req = http.get({
    protocol: 'https:',
    hostname: 'api.github.com',
    path: `/repos/zuixjs/${encodeURIComponent(templateName)}/releases/latest`,
    headers: {
      'User-Agent': githubApiUserAgent,
      'Accept': githubApiVersionAccept
    }
  }, function(response) {
    if (response.statusCode !== 200) {
      console.error(chalk.red.bold(`GitHub API Error (${response.statusCode}):`));
      let errorBody = '';
      response.on('data', chunk => errorBody += chunk);
      response.on('end', () => {
        console.error('Error Body:', errorBody);
      });
      return;
    }
    let data = [];
    response.on('data', function (chunk) {
      data.push(chunk);
    });
    response.on('end', () => {
      const releaseInfo = JSON.parse(Buffer.concat(data).toString());
      if (!releaseInfo.tag_name) {
        console.error(chalk.red.bold('Error: tag_name not found in API response!'));
        console.error('Release Info:', releaseInfo);
        return;
      }
      mkdirp.sync(projectName);
      console.debug('- %s "%s"', chalk.blue.bold('created folder'), projectName);
      downloadAndInstall({
        protocol: 'https:',
        hostname: 'codeload.github.com',
        path: `/zuixjs/${encodeURIComponent(templateName)}/zip/refs/tags/${releaseInfo.tag_name}`,
        headers: { 'User-Agent': githubApiUserAgent }
      }, projectName, `${templateName}-${releaseInfo.tag_name}`);
    });
  });
  req.on('error', (e) => {
    console.error('API Request Error:', e);
  });
}

function downloadAndInstall(httpOptions, projectName, releaseName) {
  const zipFile = path.join(projectName, 'web-starter.zip');
  const file = fs.createWriteStream(zipFile);
  console.debug('- %s', chalk.blue('downloading web-starter'));
  http.get(httpOptions, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close(async () => {
        console.log('- %s', chalk.blue('extracting'));
        await extractZip(zipFile, {dir: path.resolve(projectName)}).then(() => {
          fs.unlinkSync(zipFile);
          console.log('- %s', chalk.blue('copying files'));
          const templateFolder = path.join(projectName, releaseName);
          if (!copyFolder(templateFolder, projectName, () => {
            fs.rmSync(templateFolder, { recursive: true });

            // replace 'projectName' in config/*.json and packages.json
            const appConfig = {
              zuix: {
                app: {
                  title: projectName,
                  subtitle: 'A new awesome website!'
                }
              }
            };
            updateConfigFile(path.resolve(projectName, 'config', 'default.json'), appConfig);
            updateConfigFile(path.resolve(projectName, 'config', 'production.json'), appConfig);
            updateConfigFile(path.resolve(projectName, 'package.json'), {
              name: projectName, version: '1.0.0', description: appConfig.description
            }, [ 'keywords', 'author', 'homepage', 'repository', 'bugs' ]);

            console.log('- %s', chalk.blue('installing packages'));
            npmInstall(projectName);
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
