/*
 * Copyright 2017-2019 G-Labs. All Rights Reserved.
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

// common
const fs = require('fs');
const path = require('path');
const url = require('url');
const util = require('util');
const request = require('sync-request');
const stringify = require('json-stringify');

// swig-markdown (static-site)
//const staticSite = require('./swig-md');
// ESLint
//const linter = require('eslint').linter;
//const lintConfig = require(process.cwd() + '/.eslintrc');
// LESS
//const less = require('less');
//const lessConfig = require(process.cwd() + '/.lessrc');
// minifier
const minify = require('html-minifier').minify;
const mkdirp = require('mkdirp');

// zuix-bundler cli
const jsdom = require('jsdom');
const {JSDOM} = jsdom;

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

const LIBRARY_PATH_DEFAULT = 'https://zuixjs.github.io/zkit/lib';
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
  const virtualConsole = new jsdom.VirtualConsole();
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
        if (el.getAttribute('defer') != null) {
          return;
        }
        const resourcePath = el.getAttribute('src');
        let scriptText = fetchResource(resolveResourcePath(fileName, resourcePath), true);
        if (scriptText != null) {
          // TODO: maybe the '{% raw %}' directive can be deprecated now with 11ty
          scriptText = '//{% raw %}\n' + scriptText + '\n//{% endraw %}';
          el.innerHTML = scriptText;
          el.removeAttribute('src');
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
          // TODO: maybe the '{% raw %}' directive can be deprecated now with 11ty
          el.outerHTML = '<style>\n/*{% raw %}*/\n' + cssText + '\n/*{% endraw %}*/\n</style>';
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
        // do not process inline views
        if (dom.window.document.querySelectorAll('[data-ui-view="' + resourcePath + '"]').length > 0 ||
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
// TODO: apply template engine 11ty (?)
// TODO: apply template engine 11ty (?)
// TODO: apply template engine 11ty (?)
//            content = staticSite.swig({file: filePath + '.js', content: content}, localVars)._result.contents;
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
// TODO: document `unwrap` mode
          if (el.getAttribute('data-ui-mode') === 'unwrap') {
            // TODO: add HTML comment with file info
            el.outerHTML = content;
          } else {
            zuixBundle.viewList.push({path: resourcePath, content: content, element: el});
          }
        }
        // CSS
        content = fetchResource(filePath + '.css');
        if (content != null) {
          if (el.getAttribute('data-ui-mode') === 'unwrap') {
            // TODO: add inline // comment with source file info
            content = util.format('\n<style id="%s">\n%s\n</style>\n', resourcePath, content);
            dom.window.document.querySelector('head').innerHTML += util.format('\n<!--{[%s]}-->\n%s', resourcePath, content);
          } else {
            zuixBundle.styleList.push({path: resourcePath, content: content});
          }
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
      return path.join(options.baseFolder, resourcePath.substring(1));
    }
    // relative path
    return path.join(path.dirname(path.join(options.baseFolder, file)), resourcePath);
  }
  return resourcePath;
}

function isUrl(path) {
  return path.indexOf('://') > 0 || path.startsWith('//');
}

function fetchResource(path, reportError) {
  let content = null;
  const error = '   ^#^R^W[%s]^:';
  if (isUrl(path)) {
    if (path.startsWith('//')) {
      path = 'https:' + path;
    }
    tlog.overwrite('   ^C%s^: downloading "%s"', tlog.busyCursor(), path);
    const res = request('GET', path);
    if (res.statusCode === 200) {
      content = res.getBody('utf8');
      tlog.overwrite('');
    } else if (reportError) {
      hasErrors = true;
      tlog.term.previousLine();
      tlog.error(error + ' %s', res.statusCode, path).br();
    }
  } else {
    tlog.overwrite('   ^C%s^: reading "%s"', tlog.busyCursor(), path);
    try {
      content = fs.readFileSync(path).toString();
      tlog.overwrite('');
    } catch (e) {
      if (reportError) {
        hasErrors = true;
        tlog.term.previousLine();
        tlog.error(error + ' > "%s"', e.code, path).br();
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

function generateApp(content, fileName) {
  // reset bundle
  zuixBundle.viewList.length = 0;
  zuixBundle.styleList.length = 0;
  zuixBundle.controllerList.length = 0;
  zuixBundle.assetList.length = 0;
  const dom = createBundle(content, fileName);
  if (dom != null) {
    if (options.build.bundle.zuix !== false) {
      let bundleViews = '';
      zuixBundle.viewList.forEach(function(v) {
        let resourcePath = resolveAppPath('/', v.path);
        resourcePath = resourcePath.lib ? resourcePath.path : v.path;
        const content = util.format('<div z-view="%s">\n%s\n</div>', resourcePath, v.content);
        bundleViews += util.format('\n<!--{[%s]}-->\n%s', v.path, content);
        stats[v.path] = stats[v.path] || {};
        stats[v.path].view = true;
      });
      const resourceBundle = [];
      zuixBundle.controllerList.forEach(function(s) {
        // TODO: ensure it ends with ';'
        let resourcePath = resolveAppPath('/', s.path);
        resourcePath = resourcePath.lib ? resourcePath.path : s.path;
        getBundleItem(resourceBundle, resourcePath).controller = s.content;
        stats[s.path] = stats[s.path] || {};
        stats[s.path].controller = true;
      });
      zuixBundle.styleList.forEach(function(s) {
        let resourcePath = resolveAppPath('/', s.path);
        resourcePath = resourcePath.lib ? resourcePath.path : s.path;
        getBundleItem(resourceBundle, resourcePath).css = s.content;
        stats[s.path] = stats[s.path] || {};
        stats[s.path].css = true;
      });
      // add style to hide inline views
      // add inline views
      if (bundleViews.length > 0) {
        const head = dom.window.document.querySelector('head');
//        head.innerHTML += '    <style>[z-view]:not([z-include]):not([z-load]) { display: none; }</style>\n';
        dom.window.document.body.innerHTML += '<!-- zUIx.js inline resources bundle -->'
            + bundleViews;
      }
      // add zuix resource bundle (css,js)
      const json = stringify(resourceBundle, null, 2);
      if (resourceBundle.length > 0) {
        const jsonBundle = '\n<script>zuix.bundle(' + json + ')</script>\n';
        dom.window.document.body.innerHTML += jsonBundle;
      }
    }
    if (options.build.bundle.js !== false) {
      // TODO: report in final summary
      zuixBundle.assetList.forEach(function(a) {
        stats[a.path] = stats[a.path] || {};
        stats[a.path].script = true;
      });
    }
    if (options.build.bundle.css !== false) {
      // TODO: report in final summary
      zuixBundle.assetList.forEach(function(a) {
        stats[a.path] = stats[a.path] || {};
        stats[a.path].style = true;
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
  //console.log('BASE FOLDER', options.baseFolder);
  const inputFile = path.join(options.baseFolder, relativeFilePath);
  tlog.overwrite('   ^C%s^: reading "%s"', tlog.busyCursor(), inputFile);
  const error = '   ^#^R^W[%s]^:';
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
  tlog.overwrite('^w%s^:', outputFile).br();
//  let postProcessed = false;
  if (relativeFilePath.endsWith('.html')) {
    // Generate resources bundle
    tlog.overwrite(' ^r*^: resource bundle');
    content = generateApp(content, outputFile);
    if (Object.keys(stats).length > 0) {
      if (!hasErrors) {
        tlog.overwrite(' ^G\u2713^: resource bundle');
      }
      // output stats
      for (const key in stats) {
        const s = stats[key];
        const ok = '^+^g';
        const ko = '^w';
        tlog.info('   ^w[^:%s^:%s^:%s^:^w]^: %s',
          s.view ? ok + 'v' : ko + '-',
          s.css ? ok + 's' : ko + '-',
          s.controller ? ok + 'c' : ko + '-',
          '^:' + key
        );
      }
      tlog.info();
//      postProcessed = true;
    } else {
      //tlog.overwrite();
    }
    if (options.build.minify != null && options.build.minify !== false && options.build.minify.disable !== true) {
      tlog.overwrite(' ^r*^: minify');
      content = minify(content, options.build.minify);
      tlog.overwrite(' ^G\u2713^: minify').br();
      //tlog.info();
    }
  } else {
    tlog.overwrite();
  }

//  if (isStaticSite) {
//    tlog.info(' ^G\u2713^: static-site content').br();
//    postProcessed = true;
//  }
  /*
    if (options.build.esLint) {
      // run ESlint
      if (page.file.endsWith('.js')) {
        tlog.info(' ^r*^: lint');
        const issues = linter.verify(page.content, lintConfig, page.file);
        issues.forEach(function(m) {
          if (m.fatal || m.severity > 1) {
            tlog.error('   ^RError^: %s ^R(^Y%s^w:^Y%s^R)', m.message, m.line, m.column);
          } else {
            tlog.warn('   ^YWarning^: %s ^R(^Y%s^w:^Y%s^R)', m.message, m.line, m.column);
          }
        });
        if (issues.length === 0) {
          tlog.overwrite(' ^G\u2713^: lint');
        }
        tlog.info();
        postProcessed = true;
      }
    }

    if (options.build.less) {
      // run LESS
      if (page.file.endsWith('.less')) {
        tlog.info(' ^r*^: less');
        less.render(page.content, lessConfig, function(error, output) {
          const baseName = page.dest.substring(0, page.dest.length - 5);
          mkdirp(path.dirname(baseName + '.css'), function(err) {
            if (err) return cb(err);
            fs.writeFileSync(baseName + '.css', output.css);
            // TODO: source map generation disabled
            //fs.writeFileSync(baseName+'.css.map', output.map);
          });
          tlog.overwrite(' ^G\u2713^: less');
        });
        tlog.info();
        postProcessed = true;
      }
    }
    cb(null, page.content);
   */
//  if (!postProcessed) {
//  tlog.info();
//  }
  outputFile = path.join(options.baseFolder, outputFile);
  if (content !== initialContent || inputFile !== outputFile) {
    mkdirp.sync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, content);
    tlog.overwrite(' ^G\u2713^: wrote %s', relativeFilePath);
  } else {
    tlog.overwrite(' ^G=^: skipped (same as input)');
  }
  console.log();
  process.exitCode = tlog.stats().error;
  return process.exitCode;
}

module.exports = compilePage;
