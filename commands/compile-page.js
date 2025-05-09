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
 * @author Generoso Martello - G-Labs https://github.com/genemars
 */

// common
const fs = require('fs');
const path = require('path');
const url = require('url');
const mkdirp = require('mkdirp');
const {isRemoteUrl, fetchAndCache, normalizeControllerCode} = require('../common/utils');

// minifier
const minify = require('html-minifier-terser').minify;
const UglifyJS = require('uglify-js');

// JS DOM
const {JSDOM, VirtualConsole} = require('jsdom');

// logging
const tlog = require('../common/logger');

const zuixBundle = {
  viewList: [],
  styleList: [],
  controllerList: [],
  assetList: [],
  usingList: []
};
let stats;
let hasErrors;

let loadTypeGuessCache = {};
let compilePageEndTs = 0;

const LIBRARY_PATH_DEFAULT = 'https://zuixjs.github.io/zkit/lib/1.1';
const options = require('../common/default-config');

// TODO: deprecate older `data-ui` prefix

function createBundle(content, fileName) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(content, {virtualConsole});
  if (content.indexOf('<html') < 0 && content.indexOf('<HTML') < 0) {
    dom.unwrap = true;
  }
  // JavaScript resources
  if (options.build.bundle && options.build.bundle.js) {
    // TODO: check/parse scripts
    const scriptList = dom.window.document.querySelectorAll('script[src]');
    if (scriptList != null) {
      scriptList.forEach(function(el) {
        const resourcePath = el.getAttribute('src');
        // scripts with 'bundle="false"|async|defer' attribute and zuix[.min].js are excluded from bundle
        if (el.getAttribute('bundle') === "false" ||
            (el.getAttribute('bundle') !== "true"
                && (el.getAttribute('async') != null || el.getAttribute('defer') != null || resourcePath.indexOf('/zuix.') >= 0)
            )
        ) {
          return;
        }
        let scriptText = fetchResource(resolveResourcePath(fileName, resourcePath), true);
        if (scriptText != null) {
          const linkRel = dom.window.document.querySelectorAll(`link[rel="preload"][href="${resourcePath}"]`);
          linkRel.forEach(l => l.remove());
          el.remove();
          zuixBundle.assetList.push({path: resourcePath, content: scriptText, type: 'script'});
        }
      });
    }
  }

  // CSS resources
  if (options.build.bundle && options.build.bundle.css) {
    // TODO: check/parse css
    const styleList = dom.window.document.querySelectorAll('link[rel="stylesheet"][href]');
    if (styleList != null) {
      styleList.forEach(function(el) {
        const resourcePath = el.getAttribute('href');
        const cssText = fetchResource(resolveResourcePath(fileName, resourcePath), true);
        if (cssText != null) {
          const linkRel = dom.window.document.querySelectorAll(`link[rel="preload"][href="${resourcePath}"]`);
          linkRel.forEach(l => l.remove());
          el.outerHTML = `<style z-ref="${resourcePath}">
${cssText}
</style>`;
          zuixBundle.assetList.push({path: resourcePath, content: cssText, type: 'style'});
        }
      });
    }
  }

  // zUIx resources
  if (options.build.bundle.zuix !== false) {
    processLoadedFromCode(dom.window.document.body.innerHTML);
    const nodeList = dom.window.document.querySelectorAll('[data-ui-include],[data-ui-load],[z-include],[z-load]');
    if (nodeList != null) {
      nodeList.forEach(function(el) {
        let skipElement = false;
        let parent = el.parentNode;
        while (parent != null) {
          if (parent.tagName === 'PRE') {
            skipElement = true;
            break;
          }
          parent = parent.parentNode;
        }
        if (skipElement) {
          return;
        }

        let hasJsFile = false;
        let resourcePath = el.getAttribute('data-ui-include');
        if (resourcePath == null || resourcePath === '') {
          resourcePath = el.getAttribute('z-include');
        }
        if (resourcePath == null || resourcePath === '') {
          hasJsFile = el.getAttribute('view') == null;
          resourcePath = el.getAttribute('data-ui-load');
          if (resourcePath == null || resourcePath === '') {
            resourcePath = el.getAttribute('z-load');
          }
        }
        // do not process inline views or "default" component
        if (resourcePath === 'default' || dom.window.document.querySelectorAll('[data-ui-view="' + resourcePath + '"]').length > 0 ||
            dom.window.document.querySelectorAll('[z-view="' + resourcePath + '"]').length > 0) {
          return;
        }

        const filePath = resolveAppPath(options.baseFolder, resourcePath).path;
        let content;
        if (hasJsFile) {
          if (isBundled(zuixBundle.controllerList, resourcePath)) {
            return;
          }
          content = fetchResource(filePath + '.js', true);
          if (content != null) {
            zuixBundle.controllerList.push({path: resourcePath, content});
            processLoadedFromCode(content);
          }
        }
        // HTML
        const item = isBundled(zuixBundle.viewList, resourcePath);
        if (item !== false) {
          item.count++;
          return;
        }
        if (el.getAttribute('ctrl') == null) {
          content = fetchResource(filePath + '.html', !hasJsFile);
          if (content != null) {
            const dm = createBundle(content, path.join(options.baseFolder, options.app.resourcePath, filePath + '.html'));
            content = dm.window.document.body.innerHTML;
            zuixBundle.viewList.push({path: resourcePath, content, element: el});
          }
          // CSS
          content = fetchResource(filePath + '.css');
          if (content != null) {
            zuixBundle.styleList.push({path: resourcePath, content});
          }
        }
      });
    }
  }
  return dom;
}

function processLoadedFromCode(scriptText) {
  const getArguments = function(s) {
    let open = s.indexOf('(');
    let close = open;
    let counter = 1;
    while (counter > 0 && counter < s.length) {
      let c = s[++close];
      if (c === '(') {
        counter++;
      } else if (c === ')') {
        counter--;
      }
    }
    return s.substring(open + 1, close)
        .split(',')
        .map(a => a.trim().replace(/(^["']|["']$)/g, ''));
  };

  // zuix.load(...)
  let reg = /zuix.load\s*\(([^\)]+)\)/g;
  let result;
  while ((result = reg.exec(scriptText)) !== null) {
    // It's not possible to determine loading options in this case,
    // so we try loading all of 3 files anyway (js + html + css)
    // `loadTypeGuessCache` will store last guess and prevent from
    // trying loading again non-existent files when another page
    // is compiled during the current build session.
    const args = getArguments(scriptText.substring(result.index));
    const path = args[0];
    if (path) {
      const filePath = resolveAppPath(options.baseFolder, path).path;
      let content;
      if (!loadTypeGuessCache[filePath + '.js']) {
        content = fetchResource(filePath + '.js', false);
        if (content) {
          zuixBundle.controllerList.push({path, content});
          processLoadedFromCode(content);
        } else {
          loadTypeGuessCache[filePath + '.js'] = true;
        }
      }
      if (!loadTypeGuessCache[filePath + '.html']) {
        content = fetchResource(filePath + '.html', false);
        if (content) {
          zuixBundle.viewList.push({path, content});
        } else {
          loadTypeGuessCache[filePath + '.html'] = true;
        }
      }
      if (!loadTypeGuessCache[filePath + '.css']) {
        content = fetchResource(filePath + '.css', false);
        if (content) {
          zuixBundle.styleList.push({path, content});
        } else {
          loadTypeGuessCache[filePath + '.css'] = true;
        }
      }
    }
  }

  // zuix.loadComponent(...)
  reg = /zuix.loadComponent\s*\(([^\)]+)\)/g;
  while ((result = reg.exec(scriptText)) !== null) {
    const args = getArguments(scriptText.substring(result.index));
    const path = args[1];
    const type = args[2];
    if (path) {
      const filePath = resolveAppPath(options.baseFolder, path).path;
      let content = '';
      if (type !== 'view') {
        content = fetchResource(filePath + '.js', false);
        if (content) {
          zuixBundle.controllerList.push({path, content});
          processLoadedFromCode(content);
        }
      }
      if (type !== 'ctrl') {
        content = fetchResource(filePath + '.html', false);
        if (content) {
          zuixBundle.viewList.push({path, content});
        }
        content = fetchResource(filePath + '.css', false);
        if (content) {
          zuixBundle.styleList.push({path, content});
        }
      }
    }
  }

  // zuix.using(...)
  reg = /zuix.using\s*\(([^\)]+)\)/g;
  while ((result = reg.exec(scriptText)) !== null) {
    const args = getArguments(scriptText.substring(result.index));
    const type = args[0];
    const usingPath = args[1];
    if (usingPath) {
      if (type === 'component') {
        const resourcePath = resolveAppPath('', usingPath, '.').path;
        if (!isBundled(zuixBundle.controllerList, resourcePath)) {
          const content = fetchResource(isRemoteUrl(resourcePath) ? resourcePath + '.js' : path.join(options.build.input, resourcePath + '.js'), true);
          zuixBundle.controllerList.push({path: resourcePath, content});
          processLoadedFromCode(content);
        }
      } else {
        const resourcePath = resolveAppPath('', usingPath, '.').path;
        const content = fetchResource(isRemoteUrl(resourcePath) ? resourcePath : path.join(options.build.input, resourcePath), true);
        if (content) {
          zuixBundle.usingList.push({path: resourcePath, content, type});
          if (type === 'script') {
            processLoadedFromCode(content);
          }
        }
      }
    }
  }
}

function resolveAppPath(basePath, filePath, resourcePath) {
  let isLibraryPath = false;
  if (!isRemoteUrl(filePath)) {
    const config = options.app;
    if (filePath[0] === '@') {
      let libraryPath = LIBRARY_PATH_DEFAULT;
      if (config != null) {
        switch (typeof config.libraryPath) {
          case 'object':
            for (const k in config.libraryPath) {
              if (filePath === k || filePath.startsWith(k + '/')) {
                libraryPath = config.libraryPath[k];
                break;
              }
            }
            break;
          case 'string':
            libraryPath = config.libraryPath;
            break;
        }
      }
      if (filePath.indexOf('/') < 0) {
        filePath = libraryPath;
      } else {
        const relPath = filePath.substring(filePath.indexOf('/') + 1);
        filePath = url.resolve(libraryPath, relPath);
        if (filePath.startsWith('/')) {
          let offset = 1;
          if (filePath.startsWith(options.app.baseUrl)) {
            offset = options.app.baseUrl.length;
          }
          filePath = filePath.substring(offset);
          while (filePath.startsWith('/')) filePath = filePath.substring(1);
          filePath = path.join(basePath, filePath);
        }
      }
      isLibraryPath = true;
    }
    if (!isLibraryPath) {
      filePath = path.join(basePath, resourcePath ? resourcePath : config ? config.resourcePath : '', filePath);
    }
  }
  return {
    lib: isLibraryPath,
    path: filePath
  };
}

function resolveResourcePath(file, resourcePath) {
  if (!isRemoteUrl(resourcePath)) {
    // absolute path
    if (resourcePath.startsWith('/')) {
      let offset = 1;
      if (resourcePath.startsWith(options.app.baseUrl)) {
        offset = options.app.baseUrl.length;
      }
      return path.join(options.baseFolder, resourcePath.substring(offset));
    }
    // relative path
    return path.join(path.dirname(path.join(options.baseFolder, file)), resourcePath);
  }
  return resourcePath;
}

function fetchResource(resourcePath, reportError) {
  let content = null;
  if (isRemoteUrl(resourcePath)) {
    if (resourcePath.startsWith('//')) {
      resourcePath = 'https:' + resourcePath;
    }
    const cachedFile = fetchAndCache(resourcePath, path.join('.zuix', 'cache'), {
      onFileCached: (res, cached) => {
        tlog.overwrite('   %s cached "%s"', tlog.busyCursor(), res);
        tlog.overwrite('');
      },
      onFileDownload: (res, cached) => {
        tlog.overwrite('   %s downloading "%s"', tlog.busyCursor(), res);
      },
      onFileSaved: (res, cached) => {
        tlog.overwrite('');
      },
      onError: (res, cached) => {
        if (reportError) {
          hasErrors = true;
          tlog.term.previousLine();
          tlog.error(' ' + tlog.color('red') + 'x' + tlog.color('reset') + ' ' + resourcePath + '                ').br();
        }
      }
    });
    content = cachedFile.content;
    hasErrors = hasErrors || (reportError && content == null);
  } else {
    tlog.overwrite('   %s reading "%s"', tlog.busyCursor(), resourcePath);
    try {
      content = fs.readFileSync(resourcePath).toString();
      tlog.overwrite('');
    } catch (e) {
      if (reportError) {
        hasErrors = true;
        tlog.term.previousLine();
        tlog.error('   [%s] > "%s"', e.code, resourcePath).br();
      }
    }
  }
  return content;
}

function remoteAssetsMirror(dom, buildFolder, baseUrl, elementSelector) {
  const mirroredElements = [];
  const explicitMirrorAttribute = 'z-mirror';
  const defaultMirrorFolder = path.join(buildFolder, 'assets', 'mirror');
  const getRemoteAsset = (url, mirrorFolder) => {
    return fetchAndCache(url, mirrorFolder, {
      onFileCached: (res, cached) => {
        tlog.overwrite('   * cached asset "%s"', res).br();
        //tlog.overwrite('');
      },
      onFileDownload: (res, cached) => {
        tlog.overwrite('   %s downloading "%s"', tlog.busyCursor(), res);
      },
      onFileSaved: (res, cached) => {
        tlog.overwrite('   * saved asset "%s"', res).br();
      },
      onError: (res, cached) => {
        tlog.term.previousLine();
        tlog.error('   [%s] %s', res.status, url).br();
      }
    });
  }
  const nodeList = dom.window.document
      .querySelectorAll(`[${explicitMirrorAttribute}]${elementSelector ? ',' + elementSelector : ''}`);
  if (nodeList != null) {
    nodeList.forEach(function(el) {
      let localResourcePath = false;
      let resourcePath = '';
      let targetAttribute = el.getAttribute(explicitMirrorAttribute);
      if (targetAttribute) {
        resourcePath = el[targetAttribute];
      } else {
        const checkAttributes = ['href', 'src', 'srcset'];
        for (let a = 0; a < checkAttributes.length; a++) {
          const attr = checkAttributes[a];
          if (el.hasAttribute(attr)) {
            resourcePath = el[attr];
            targetAttribute = attr;
            break;
          }
        }
      }
      if (isRemoteUrl(resourcePath)) {
        const cachedFile = getRemoteAsset(resourcePath, defaultMirrorFolder);
        if (cachedFile.content != null) {
          localResourcePath = cachedFile.cachedPath;
        }
      }
      // replace attribute value with local mirrored resource url
      if (localResourcePath) {
        localResourcePath = localResourcePath.substring(buildFolder.length + 1);
        localResourcePath = path.join(baseUrl, localResourcePath);
        el.setAttribute(targetAttribute, localResourcePath);
        el.removeAttribute(explicitMirrorAttribute);
        mirroredElements.push(el);
      }
    });
  }
  return mirroredElements;
}

function isBundled(list, path) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].path === path) {
      return list[i];
    }
  }
  return false;
}

function getBundleItem(bundle, path) {
  let item = null;
  const AlreadyExistsException = {};
  try {
    bundle.forEach(function(b) {
      if (b.componentId === path) {
        item = b;
        throw AlreadyExistsException;
      }
    });
  } catch (e) {
    if (e === AlreadyExistsException) {
      return item;
    }
  }
  item = {
    componentId: path
  };
  bundle.push(item);
  return item;
}

function addJsBundle(dom, scriptText, bundleFileName, section) {
  if (options.build.minify.minifyJS !== false) {
    const minifyOptions = options.build.minify.minifyJS !== true ? options.build.minify.minifyJS : {};
    scriptText = UglifyJS.minify({ "script.js": scriptText }, minifyOptions).code;
  }
  fs.writeFileSync(bundleFileName, scriptText);
  bundleFileName = path.basename(bundleFileName);
  dom.window.document[section].innerHTML += `
<!-- zUIx.js inline resources bundle -->
<script src="${bundleFileName}"></script>
`;
  tlog.overwrite(' \u2713 added %s\n', bundleFileName);
}

function generateApp(content, fileName) {
  // reset bundle
  zuixBundle.viewList.length = 0;
  zuixBundle.styleList.length = 0;
  zuixBundle.controllerList.length = 0;
  zuixBundle.assetList.length = 0;
  zuixBundle.usingList.length = 0;
  const dom = createBundle(content, fileName);
  if (dom != null) {
    // copy/cache remote images and other assets updating element reference to local url
    let mirroredElements = [];
    if (options.build.mirror) {
      let implicitSelector = null;
      if (Array.isArray(options.build.mirror)) {
        implicitSelector = options.build.mirror.join(',');
      } if (typeof options.build.mirror === 'string') {
        implicitSelector = options.build.mirror;
      }
      mirroredElements = remoteAssetsMirror(dom, options.build.output, options.app.baseUrl, implicitSelector);
    }
    // collect bundle items
    if (options.build.bundle.zuix !== false) {
      const resourceBundle = [];
      zuixBundle.viewList.forEach(function(v) {
        let resourcePath = resolveAppPath(options.app.baseUrl, v.path);
        resourcePath = resourcePath.lib ? resourcePath.path : v.path;
        getBundleItem(resourceBundle, resourcePath).view = v.content;
        stats[v.path] = stats[v.path] || {};
        stats[v.path].view = true;
      });
      zuixBundle.controllerList.forEach(function(s) {
        // TODO: ensure it ends with ';'
        let resourcePath = resolveAppPath(options.app.baseUrl, s.path);
        resourcePath = resourcePath.lib ? resourcePath.path : s.path;
        getBundleItem(resourceBundle, resourcePath).controller = s.content.replace(/^\n|\n$/g, '');
        stats[s.path] = stats[s.path] || {};
        stats[s.path].controller = true;
      });
      zuixBundle.styleList.forEach(function(s) {
        let resourcePath = resolveAppPath(options.app.baseUrl, s.path);
        resourcePath = resourcePath.lib ? resourcePath.path : s.path;
        getBundleItem(resourceBundle, resourcePath).css = s.content;
        stats[s.path] = stats[s.path] || {};
        stats[s.path].css = true;
      });
      zuixBundle.usingList.forEach(function(s) {
        let resourcePath = resolveAppPath('', s.path, '.');
        resourcePath = resourcePath.lib ? resourcePath.path : s.path;
        const componentId = '_res/' + s.type + '/' + s.type + '-' + s.path.hashCode();
        if (s.type === 'script') {
          getBundleItem(resourceBundle, componentId).controller = s.content.replace(/^\n|\n$/g, '');
        } else if (s.type === 'style') {
          getBundleItem(resourceBundle, componentId).css = s.content.replace(/^\n|\n$/g, '');
        }
        getBundleItem(resourceBundle, componentId).using = resourcePath;
        stats[s.path] = stats[s.path] || {};
        stats[s.path].using = true;
      });

      // Create page bundle for zuix components
      if (resourceBundle.length > 0) {
        let zuixComponents = 'zuix.setComponentCache([';
        resourceBundle.forEach((r, i) => {
          let ctrl = 'null';
          if (r.controller) {
            if (r.using == null) {
              ctrl = normalizeControllerCode(r.controller);
              ctrl = `(function () {
${ctrl}
    //# sourceURL="${r.componentId}.js"
  })()`;
            } else {
              ctrl = `${JSON.stringify(r.controller)}`;
            }
          }
          zuixComponents += `{
  componentId: "${r.componentId}",
  controller: ${ctrl}${r.css ? ',\n    css: ' + JSON.stringify(r.css) : ''}${r.view ? ',\n    view: ' + JSON.stringify(r.view) : ''}${r.using ? ',\n    using: ' + JSON.stringify(r.using) : ''}
}`;
          if (i < resourceBundle.length - 1) {
            zuixComponents += ',';
          }
        });
        zuixComponents += ']);\n';
        const bundleFileName = path.join(options.baseFolder, fileName.replace('.html', '.bundle.js'));
        addJsBundle(dom, zuixComponents, bundleFileName, 'head');
      }
    }
    // Create bundle for third-party scripts
    let vendorScripts = '';
    if (options.build.bundle.js !== false) {
      zuixBundle.assetList.forEach(function(a) {
        if (a.type === 'script') {
          vendorScripts += `
// -#[ BEGIN inline script z-ref="${a.path}" ]#- //
${a.content}
// -#[ END   inline script z-ref="${a.path}" ]#- //
            `;
        }
      });
    }
    if (vendorScripts.length > 0) {
      const bundleFileName = path.join(options.baseFolder, fileName.replace('.html', '.bundle.ext.js'));
      addJsBundle(dom, vendorScripts, bundleFileName, 'body');
    }

    if (options.build.bundle.js !== false || options.build.bundle.css !== false) {
      // TODO: report in final summary
      zuixBundle.assetList.forEach(function(a) {
        stats[a.path] = stats[a.path] || {};
        if (a.type === 'script') {
          stats[a.path].script = true;
        } else {
          stats[a.path].style = true;
        }
      });
    }

    const processed = zuixBundle.viewList.length > 0 || zuixBundle.styleList.length > 0
    || zuixBundle.controllerList.length > 0 || zuixBundle.assetList.length > 0
    || mirroredElements.length > 0;
    if (processed) {
      content = dom.unwrap ? dom.window.document.body.innerHTML : dom.serialize();
    }
    return content;
  }
}

function compilePage(relativeFilePath, outputFile, opts) {
  if (compilePageEndTs - new Date().getTime() > 1000) {
    // auto-reset type-load cache
    loadTypeGuessCache = {};
  }
  Object.assign(options, opts);
  const inputFile = path.join(options.baseFolder, relativeFilePath);
  tlog.overwrite('   %s reading "%s"', tlog.busyCursor(), inputFile);
  const error = '   [%s]';
  let content;
  try {
    content = fs.readFileSync(inputFile).toString();
    tlog.overwrite('');
  } catch (e) {
    hasErrors = true;
    tlog.term.previousLine();
    tlog.error(error + ' > "%s"', e.code, inputFile).br('\n');
    process.exitCode = -1
    return -1;
  }
  const initialContent = content;
  // overwrite inputFile if outputFile is not specified
  if (outputFile == null) {
    outputFile = relativeFilePath;
  }

//TODO:  localVars = page;
  // reset globals for every page
  stats = {};
  hasErrors = false;
  // zUIx bundle
  tlog.overwrite('%s', outputFile).br();
  if (relativeFilePath.endsWith('.html')) {
    // Generate resources bundle
    tlog.overwrite(' * resource bundle');
    content = generateApp(content, outputFile);
    if (Object.keys(stats).length > 0) {
      if (!hasErrors) {
        tlog.overwrite(' \u2713 resource bundle');
      } else {
        tlog.overwrite(' ' + tlog.color('red') + 'x' + tlog.color('reset') + ' resource bundle');
      }
      // output stats
      for (const key in stats) {
        const s = stats[key];
        const ok = tlog.color('green');
        const ko = tlog.color('white');
        tlog.info('   [%s%s%s] %s',
            (s.view ? ok + 'v' : ko + '-') + tlog.color('reset'),
            (s.css ? ok + 's' : ko + '-') + tlog.color('reset'),
            (s.controller ? ok + 'c' : ko + '-') + tlog.color('reset'),
          '' + key
        );
      }
      tlog.info();
    } else {
      //tlog.overwrite();
    }
    if (options.build.minify != null && options.build.minify !== false && options.build.minify.disable !== true) {
      tlog.overwrite(' * minify');
      content = minify(content, options.build.minify);
      tlog.overwrite(' \u2713 minify').br();
      //tlog.info();
    }
  } else {
    tlog.overwrite();
  }

  outputFile = path.join(options.baseFolder, outputFile);
  if (content !== initialContent || inputFile !== outputFile) {
    mkdirp.sync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, content);
    tlog.overwrite(' \u2713 wrote %s', relativeFilePath).br();
  } else {
    tlog.overwrite(' = skipped (same as input)').br();
  }
  console.log();
  compilePageEndTs = new Date().getTime();
  process.exitCode = tlog.stats().error;
  return process.exitCode;
}

module.exports = compilePage;
