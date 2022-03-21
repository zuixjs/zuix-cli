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
const request = require('sync-request');

// minifier
const minify = require('html-minifier').minify;
const UglifyJS = require('uglify-js');

// JS DOM
const {JSDOM, VirtualConsole} = require('jsdom');

// logging
const tlog = require('../common/logger');

const zuixBundle = {
  viewList: [],
  styleList: [],
  controllerList: [],
  assetList: []
};
let stats;
let hasErrors;

const LIBRARY_PATH_DEFAULT = 'https://zuixjs.github.io/zkit/lib/1.1';
const options = require('../common/default-config');

// TODO: implement embedding of resources loaded with `zuix.using(..)` and `zuix.load(..)`
/*
let reg = /zuix.load\(([^\)]+)\)/g;
let result;
while ((result = reg.exec(scriptText)) !== null) {
    // ....
}
// ...
reg = /zuix.using\(([^\)]+)\)/g;
while ((result = reg.exec(scriptText)) !== null) {
    // ....
}
 */

// TODO: implement also `z-` prefix backward compatible with older `data-ui` prefix

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
        // scripts with 'defer' attribute and zuix[.min].js are excluded from bundle
        if (el.getAttribute('defer') != null || resourcePath.indexOf('/zuix.') >= 0) {
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
            zuixBundle.controllerList.push({path: resourcePath, content: content});
          }
        }
        // HTML
        const item = isBundled(zuixBundle.viewList, resourcePath);
        if (item !== false) {
          item.count++;
          return;
        }
        content = fetchResource(filePath + '.html', !hasJsFile);
        if (content != null) {
          const dm = createBundle(content, path.join(options.baseFolder, options.app.resourcePath, filePath + '.html'));
          content = dm.window.document.body.innerHTML;
          zuixBundle.viewList.push({path: resourcePath, content: content, element: el});
        }
        // CSS
        content = fetchResource(filePath + '.css');
        if (content != null) {
          zuixBundle.styleList.push({path: resourcePath, content: content});
        }
      });
    }
  }
  return dom;
}

function resolveAppPath(basePath, filePath) {
  let isLibraryPath = false;
  if (!isUrl(filePath)) {
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
    filePath = isLibraryPath ? filePath : path.join(basePath, config ? config.resourcePath : '', filePath);
  }
  return {
    lib: isLibraryPath,
    path: filePath
  };
}

function resolveResourcePath(file, resourcePath) {
  if (!isUrl(resourcePath)) {
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

function isUrl(path) {
  return path.indexOf('://') > 0 || path.startsWith('//');
}

function fetchResource(resourcePath, reportError) {
  let content = null;
  const error = '   [%s]';
  if (isUrl(resourcePath)) {
    if (resourcePath.startsWith('//')) {
      resourcePath = 'https:' + resourcePath;
    }
    const parsedUrl = url.parse(resourcePath);
    let cachePath = path.join('.zuix', 'cache', parsedUrl.hostname, parsedUrl.path);
    if (fs.existsSync(cachePath)) {
      tlog.overwrite('   %s cached "%s"', tlog.busyCursor(), resourcePath);
      content = fs.readFileSync(cachePath).toString('utf8');
      tlog.overwrite('');
    } else {
      tlog.overwrite('   %s downloading "%s"', tlog.busyCursor(), resourcePath);
      const res = request('GET', resourcePath);
      if (res.statusCode === 200) {
        content = res.getBody('utf8');
        // cache the downloaded file
        mkdirp.sync(path.dirname(cachePath));
        fs.writeFileSync(cachePath, content, { encoding: 'utf8'});
        tlog.overwrite('');
      } else if (reportError) {
        hasErrors = true;
        tlog.term.previousLine();
        tlog.error(error + ' %s', res.statusCode, resourcePath).br();
      }
    }
  } else {
    tlog.overwrite('   %s reading "%s"', tlog.busyCursor(), resourcePath);
    try {
      content = fs.readFileSync(resourcePath).toString();
      tlog.overwrite('');
    } catch (e) {
      if (reportError) {
        hasErrors = true;
        tlog.term.previousLine();
        tlog.error(error + ' > "%s"', e.code, resourcePath).br();
      }
    }
  }
  return content;
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

function addJsBundle(dom, scriptText, bundleFileName) {
  if (options.build.minify.minifyJS !== false) {
    const minifyOptions = options.build.minify.minifyJS !== true ? options.build.minify.minifyJS : {};
    scriptText = UglifyJS.minify({ "script.js": scriptText }, minifyOptions).code;
  }
  fs.writeFileSync(bundleFileName, scriptText);
  bundleFileName = path.basename(bundleFileName);
  dom.window.document.body.innerHTML += `
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
  const dom = createBundle(content, fileName);
  if (dom != null) {
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

      // Create page bundle for zuix components
      if (resourceBundle.length > 0) {
        let zuixComponents = 'zuix.setComponentCache([';
        resourceBundle.forEach((r, i) => {
          zuixComponents += `{
  componentId: "${r.componentId}",
  controller: (function () {
    module = {};

    ${r.controller}

    //# sourceURL="${r.componentId}.js"
    ; return module.exports;
  })()${r.css ? ',\n    css: ' + JSON.stringify(r.css) : ''}${r.view ? ',\n    view: ' + JSON.stringify(r.view) : ''}
}`;
          if (i < resourceBundle.length - 1) {
            zuixComponents += ',';
          }
        });
        zuixComponents += ']);\n';
        const bundleFileName = path.join(options.baseFolder, fileName.replace('.html', '.bundle.js'));
        addJsBundle(dom, zuixComponents, bundleFileName);
      }
    }

    // Create bundle for third-party scripts
    let vendorScripts = '';
    if (options.build.bundle.js !== false) {
      zuixBundle.assetList.forEach(function(a) {
        if (a.type === 'script') {
          vendorScripts += `
// -#[ BEGIN inline script z-ref="${a.path}" ]#- //
(function() {
${a.content}
}).call(self ? self : window);
// -#[ END   inline script z-ref="${a.path}" ]#- //
            `;
        }
      });
    }
    if (vendorScripts.length > 0) {
      const bundleFileName = path.join(options.baseFolder, fileName.replace('.html', '.bundle.ext.js'));
      addJsBundle(dom, vendorScripts, bundleFileName);
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
    || zuixBundle.controllerList.length > 0 || zuixBundle.assetList.length > 0;
    if (processed) {
      content = dom.unwrap ? dom.window.document.body.innerHTML : dom.serialize();
    }
    return content;
  }
}

function compilePage(relativeFilePath, outputFile, opts) {
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
  process.exitCode = tlog.stats().error;
  return process.exitCode;
}

module.exports = compilePage;
