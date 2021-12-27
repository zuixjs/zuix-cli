const path = require('path');
const config = require('config');
const util = require('util');

// zuix.js CLI utils
const zuixCompile = require('zuix-cli/commands/compile-page');
const zuixUtils = require('zuix-cli/common/utils');

const zuixConfig = config.get('zuix');
const sourceFolder = zuixConfig.get('build.input');
const buildFolder = zuixConfig.get('build.output');
const dataFolder = zuixConfig.get('build.dataFolder');
const includesFolder = zuixConfig.get('build.includesFolder');
const copyFiles = zuixConfig.get('build.copy');

// LESS
const less = require('less');
const lessConfig = require(process.cwd()+'/.lessrc');

// ESLint
const Linter = require('eslint').Linter;
const linter = new Linter();
const lintConfig = require(process.cwd()+'/.eslintrc');

const { minify } = require("terser");

// Keep track of changed files for zUIx.js post-processing
const postProcessFiles = [];
const changedFiles = [];
let browserSync;
let rebuildAll = true;
// - copy last zUIx release
zuixUtils.copyFolder(util.format('%s/node_modules/zuix-dist/js', process.cwd()), util.format('%s/js/zuix', buildFolder), (err) => {
  if (err) console.log(err);
});
// - auto-generated config.js
zuixUtils.generateAppConfig(zuixConfig);

module.exports = function(eleventyConfig) {
  eleventyConfig.setWatchJavaScriptDependencies(false);
  // Copy base files
  copyFiles.forEach((f) => {
    eleventyConfig.addPassthroughCopy(`${sourceFolder}/${f}`);
  });
  eleventyConfig.addCollection("posts_sorted", function (collectionApi) {
    return collectionApi.getFilteredByTags('post')
      .slice().sort((a, b) => a.data.title.localeCompare(b.data.title));
  });
  // Add Nunjucks
  eleventyConfig.addNunjucksAsyncFilter("jsmin", async function (
      code,
      callback
  ) {
    try {
      const minified = await minify(code);
      callback(null, minified.code);
    } catch (err) {
      console.error('Terser error: ', err);
      // Fail gracefully.
      callback(null, code);
    }
  });
  // Declare custom types / handlers
  eleventyConfig.addExtension('less', {
    read: true,
    outputFileExtension: 'css',
    compile: (content, path) => () => {
        let output;
        less.render(content, lessConfig, function(error, lessOutput) {
          output = lessOutput;
        });
        return output.css;
      }
  });
  eleventyConfig.addExtension('js', {
    read: true,
    outputFileExtension: 'js',
    compile: (content, path) => async () => {
      const output = await minify(content);
      return output.code;
    }
  });
  // Add custom file types
  eleventyConfig.addTemplateFormats([ 'less', 'css', 'js' ]);
  // Add linter
  eleventyConfig.addLinter('eslint', function(content, inputPath, outputPath) {
    if( inputPath.endsWith('.js') ) {
      const issues = linter.verify(content, lintConfig, inputPath);
      if (issues.length > 0) {
        console.log('[11ty] "%s" linter result', inputPath)
      }
      issues.forEach(function(m) {
        if (m.fatal || m.severity > 1) {
          console.error('       Error: %s (%s:%s)', m.message, m.line, m.column);
        } else {
          console.warn('       Warning: %s (%s:%s)', m.message, m.line, m.column);
        }
      });
    }
  });
  // add any BrowserSync config option here
  eleventyConfig.setBrowserSyncConfig({
    //reloadDelay: 2000,
    //files: [ path.resolve(sourceFolder, 'app') ],
    notify: true,
    callbacks: {
      ready: function(err, bs) {
        // store a local reference of BrowserSync object
        browserSync = bs;
      }
    }
  });


  // zUIx.js specific code and life-cycle hooks
  eleventyConfig.addGlobalData("app", zuixConfig.app);
  // Add zUIx transform
  eleventyConfig.addTransform('zuix-js', function(content) {
    const inputPath = this.inputPath;
    const outputPath = this.outputPath;
    const hasChanged = changedFiles.find(f => path.resolve(f) === path.resolve(inputPath));
    if (!rebuildAll && !hasChanged) return content;
    // populates a list of `.html` files
    // to be post processed after build
    if (outputPath && outputPath.endsWith('.html')) {
      let file = path.resolve(outputPath);
      const baseFolder = path.resolve(zuixConfig.build.output);
      if (file.startsWith(baseFolder)) {
        file = file.substr(baseFolder.length + 1);
      }
      postProcessFiles.push({file, baseFolder: zuixConfig.build.output});
    }
    return content;
  });
  eleventyConfig.on('beforeWatch', (cf) => {
    // changedFiles is an array of files that changed
    // to trigger the watch/serve build
    changedFiles.length = 0;
    const baseFolder = path.resolve(zuixConfig.build.input);
    const dataFolder = path.join(baseFolder, zuixConfig.build.dataFolder);
    const includesFolder = path.join(baseFolder, zuixConfig.build.includesFolder);
    const templateChanged = cf.find(f => path.resolve(f).startsWith(includesFolder));
    const dataChanged = cf.find(f => path.resolve(f).startsWith(dataFolder));
    if (templateChanged || dataChanged) {
      rebuildAll = true;
      return;
    }
    changedFiles.push(...cf);
  });
  eleventyConfig.on('afterBuild', async function(args) {
    console.log();
    postProcessFiles.forEach((pf) => {
      const result = zuixCompile(pf.file, pf.file, {
        baseFolder: pf.baseFolder,
        ...zuixConfig
      });
      // TODO: check result code and report
    });
    postProcessFiles.length = 0;
    if (zuixConfig.build.serviceWorker) {
      console.log('\nUpdating Service Worker... ');
      await zuixUtils.generateServiceWorker().then(function () {
        console.log('... Service Worker updated.');
      });
    } else {
      console.log();
    }
    if (rebuildAll) {
      // revert back to incremental build mode
      rebuildAll = false;
    }
  });


  // Return 11ty configuration options:
  return {
    pathPrefix: zuixConfig.app.baseUrl,
    dir: {
      input: sourceFolder,
      output: buildFolder,
      data: dataFolder,
      includes: includesFolder,
      layouts: "_inc/layouts"
    },
    //markdownTemplateEngine: false,
    //templateFormats: ['html', 'liquid', 'ejs', 'hbs', 'mustache', 'haml', 'pug', 'njk', '11ty.js']
  }
};
