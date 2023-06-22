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
 * @author Generoso Martello - https://github.com/genemars
 */

const {classNameFromHyphens} = require('../common/utils');
const chalk = require('chalk');
const mkdirp = require('mkdirp');
const nunjucks = require('nunjucks');
const {highlight} = require('cli-highlight');
const fs = require('fs');
const path = require('path');

const config = require('config');

let cutHereMark = '';
for (let i = 0; i < 5 ; i++) {
  cutHereMark += '·····' + chalk.yellowBright('\u2704') + '·····';
}

async function generate(...args) {
  const zuixConfig = config.get('zuix');
  const sourceFolder = zuixConfig.get('build.input');
  return new Promise((resolve, reject) => {
    let template;
    let schematic = args[0];
    const options = args[1];
    switch (schematic) {
      case 'component':
      case 'controller':
      case 'template':
        template = options[0];
        const className = classNameFromHyphens(template);
        console.log(
          chalk.cyanBright('*') + ' Generating',
          chalk.yellow.bold(schematic),
          template, '→',
          chalk.green.bold(className)
        );
        // check first if already exists
        const componentId = `${schematic}s/${template}`;
        const destinationName = path.join(sourceFolder, 'app', `${componentId}.`);
        if (fs.existsSync(destinationName + 'js') || fs.existsSync(destinationName + 'css') || fs.existsSync(destinationName + 'html')) {
          const rejectReason = `"${componentId}" already exists.`;
          console.error(
            chalk.red.bold(rejectReason)
          );
          reject(new Error(rejectReason));
        } else {
          // create output folder if does not exists
          mkdirp.sync(path.dirname(destinationName + 'js'));
          const templateData = {
            componentId,
            name: className,
            author: process.env.LOGNAME
          };
          const componentTemplate = './templates/component/component.';
          let css = fs.readFileSync(componentTemplate + 'css').toString('utf8');
          let html = fs.readFileSync(componentTemplate + 'html').toString('utf8');
          let js = fs.readFileSync(componentTemplate + 'js').toString('utf8');
          if (schematic === 'component' || schematic === 'template') {
            html = nunjucks.renderString(html, templateData);
            fs.writeFileSync(destinationName + 'html', html);
            console.log('-', chalk.yellow('added'), destinationName + 'html');
            css = nunjucks.renderString(css, templateData);
            fs.writeFileSync(destinationName + 'css', css);
            console.log('-', chalk.yellow('added'), destinationName + 'css');
          }
          if (schematic === 'component' || schematic === 'controller') {
            js = nunjucks.renderString(js, templateData);
            fs.writeFileSync(destinationName + 'js', js);
            console.log('-', chalk.yellow('added'), destinationName + 'js');
          }
          console.log('\nNEW componentId:', chalk.green.bold(componentId));
          const type = schematic === 'controller' ? 'ctrl ' : schematic === 'template' ? 'view ' : '';
          const htmlCode = `<div ${type}z-load="${componentId}"></div>`;
          console.log(cutHereMark);
          console.log(highlight(htmlCode, { language: 'html' }));
          console.log(cutHereMark + '\n');
          return resolve({componentId, path: destinationName + '*', html: htmlCode});
        }
        break;
      default:
        const rejectReason = 'Unknown schematic name.';
        console.log(
          chalk.yellow.bold(rejectReason)
        );
        reject(new Error(rejectReason));
    }
  });
}

module.exports = generate;
