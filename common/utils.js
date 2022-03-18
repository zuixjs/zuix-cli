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

// destination type must match source (dir/dir or file/file)
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const ncp = require('ncp').ncp;
const chalk = require('chalk');
const nunjucks = require('nunjucks');
const workBox = require('workbox-build');
const {JSDOM} = require('jsdom');

const options = require('./default-config');

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
    config = JSON.parse(nunjucks.renderString(JSON.stringify(config), config));
    let cfg = `/* eslint-disable quotes */
(function() {
  zuix.store('config', `;
    cfg += JSON.stringify(config.app, null, 2).replace(/\n/g, '\n  ');
    cfg += ');\n';
    // WorkBox / Service Worker
    if (config.build.serviceWorker) {
        cfg += nunjucks.renderString(`  // Check that service workers are registered
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
    config = JSON.parse(nunjucks.renderString(JSON.stringify(config), config));
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

function wrapCss(wrapperRule, css, encapsulate) {
    const wrapReX = /(([a-zA-Z0-9\240-\377=:-_- \n,.@]+.*){([^{}]|((.*){([^}]+)[}]))*})/g;
    let wrappedCss = '';
    let ruleMatch;
    // remove comments
    css = css.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/g, '');
    // some more normalization to help with parsing
    css = css.replace(/(?:\r\n|\r|\n)/g, '').replace(/}/g, '}\n').replace(/\{/g, '{\n');
    do {
        ruleMatch = wrapReX.exec(css);
        if (ruleMatch && ruleMatch.length > 1) {
            let ruleParts = ruleMatch[2];
            if (ruleParts != null && ruleParts.length > 0) {
                ruleParts = ruleParts.replace(/\n/g, '');
                const classes = ruleParts.split(',');
                let isMediaQuery = false;
                classes.forEach(function(v, k) {
                    // TODO: deprecate the 'single dot' notation
                    if (v.trim() === '.' || v.trim() === ':host') {
                        // a single `.` means 'self' (the container itself)
                        // so we just add the wrapperRule
                        wrappedCss += '\n[z-component]' + wrapperRule + ' ';
                    } else if (v.trim()[0] === '@') {
                        // leave it as is if it's an animation or media rule
                        wrappedCss += v + ' ';
                        if (v.trim().toLowerCase().startsWith('@media')) {
                            isMediaQuery = true;
                        }
                    } else if (encapsulate) {
                        // wrap the class names (v)
                        v.split(/\s+/).forEach(function(attr) {
                            attr = attr.trim();
                            if (attr.lastIndexOf('.') > 0) {
                                attr.replace(/(?=[.])/gi, ',').split(',').forEach(function(attr2) {
                                    if (attr2 !== '') {
                                        wrappedCss += '\n' + attr2 + wrapperRule;
                                    }
                                });
                            } else if (attr !== '' && attr !== '>' && attr !== '*') {
                                wrappedCss += '\n' + attr + wrapperRule + ' ';
                            } else {
                                wrappedCss += attr + ' ';
                            }
                        });
                    } else {
                        let val = v.trim();
                        if (val.startsWith(':host')) {
                            val = val.substring(5);
                        } else {
                            val = '\n' + val;
                        }
                        wrappedCss += '\n[z-component]' + wrapperRule + val + ' ';
                    }
                    if (k < classes.length - 1) {
                        wrappedCss = wrappedCss.trim() + ', ';
                    }
                });
                if (isMediaQuery) {
                    const wrappedMediaQuery = wrapCss(wrapperRule, ruleMatch[1].substring(ruleMatch[2].length).replace(/^{([^\0]*?)}$/, '$1'), encapsulate);
                    wrappedCss += '{\n  '+wrappedMediaQuery+'\n}';
                } else {
                    wrappedCss += ruleMatch[1].substring(ruleMatch[2].length) + '\n';
                }
            } else {
                _log.w('wrapCss was unable to parse rule.', ruleParts, ruleMatch);
            }
        }
    } while (ruleMatch);
    if (wrappedCss !== '') {
        css = wrappedCss;
    }
    return css;
}

function wrapDom(htmlContent, cssId) {
    const dom = JSDOM.fragment('<div>'+htmlContent+'</div>');
    dom.firstChild.firstElementChild.setAttribute('z-component', 'fragment');
    //dom.firstChild.setAttribute(cssId, 'fragment');
    const elements = dom.querySelectorAll('*:not([z-load]):not([data-ui-load]):not([z-include]):not([data-ui-include])');
    elements.forEach((el) => {
        el.setAttribute(cssId, '');
    });
    return dom.firstChild.innerHTML;
}

module.exports = {
    copyFolder,
    generateAppConfig,
    generateServiceWorker,
    hyphensToCamelCase,
    classNameFromHyphens,
    wrapCss,
    wrapDom
};
