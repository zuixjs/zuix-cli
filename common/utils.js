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

// destination type must match source (dir/dir or file/file)
const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const ncp = require('ncp').ncp;
const chalk = require('chalk');
const options = require('./default-config');
const workBox = require('workbox-build');
const render = require('template-file').render;

function copyFolder(source, destination, done) {
    // ncp.limit = 16;
    // ncp.stopOnErr = true;
    let folder = destination;
    if (fs.existsSync(source)) {
        if (fs.lstatSync(source).isFile()) {
            folder = path.dirname(destination);
        }
        if (!fs.existsSync(folder)) {
            mkdirp.sync(folder);
            console.debug('- %s "%s"', chalk.blue.bold('created folder'), folder);
        }
    } else {
        console.warn(chalk.white.bold('Source folder not found.'));
        // TODO: handle return value
        return false;
    }
    ncp(path.resolve(process.cwd(), source), path.resolve(process.cwd(), destination), function(err) {
        if (typeof done === 'function') {
            done(err);
        }
    });
    return true;
}

function generateAppConfig(opts) {
    let config = Object.assign(options, opts);
    config = JSON.parse(render(JSON.stringify(config), config));
    let cfg = `/* eslint-disable quotes */
(function() {
  zuix.store('config', `;
    cfg += JSON.stringify(config.app, null, 2).replaceAll('\n', '\n  ');
    cfg += ');\n';
    // WorkBox / Service Worker
    if (config.build.serviceWorker) {
        cfg += render(`  // Check that service workers are registered
  if ('serviceWorker' in navigator) {
    // Use the window load event to keep the page load performant
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('{{ app.baseUrl }}service-worker.js');
    });
  }\n`, config);
    }
    cfg += '})();\n';
    fs.writeFileSync(config.build.output+'/config.js', cfg);
}

function generateServiceWorker(opts) {
    let config = Object.assign(options, opts);
    config = JSON.parse(render(JSON.stringify(config), config));
    // This will return a Promise
    return workBox.generateSW({

        globDirectory: config.build.output,
        globPatterns: [
            '**\/*.{html,json,js,css}',
            '**\/*.{png,jpg,jpeg,svg,gif}'
        ],

        swDest: path.join(config.build.output, 'service-worker.js'),

        // Define runtime caching rules.
        runtimeCaching: [{
            // Match any request ends with .png, .jpg, .jpeg or .svg.
            urlPattern: /\.(?:png|jpg|jpeg|svg)$/,

            // Apply a cache-first strategy.
            handler: 'CacheFirst',

            options: {
                // Use a custom cache name.
                cacheName: 'images',
                // Cache up to 50 images.
                expiration: {
                    maxEntries: 50,
                }
            }
        },{
            // Match any request ends with .html, .json, .js or .css.
            urlPattern: /\.(?:html|json|js|css)$/,

            // Apply a cache-first strategy.
            handler: 'CacheFirst',

            options: {
                // Use a custom cache name.
                cacheName: 'default',
                // Cache up to 50 items.
                expiration: {
                    maxEntries: 50,
                }
            }
        }]

    });
}
function hyphensToCamelCase(s) {
    return s.replace(/-([a-z0-9_$-])/g, function (g) {
        return '_$-'.indexOf(g[1]) > -1 || (+g[1]).toString() === g[1] ?
            '_' + g[1].replace('-', '_') : g[1].toUpperCase();
    });
}
function classNameFromHyphens(s) {
    const baseName = path.basename(s + '.js', '.js');
    const name = hyphensToCamelCase(baseName);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

module.exports = {
    copyFolder: copyFolder,
    generateAppConfig: generateAppConfig,
    generateServiceWorker: generateServiceWorker,
    hyphensToCamelCase: hyphensToCamelCase,
    classNameFromHyphens: classNameFromHyphens
};
