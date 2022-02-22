module.exports = {
    baseFolder: './',
    build: {
        input: 'source',
        output: 'docs',
        dataFolder: '_data',
        includesFolder: '_inc',
        componentsFolders: [ 'app', 'lib' ],
        bundle: {
            js: false,
            css: false,
            zuix: false
        },
        minify: {
            disable: true,
            collapseWhitespace: true,
            removeOptionalTags: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeTagWhitespace: false,
            useShortDoctype: false,
            collapseBooleanAttributes: true,
            removeAttributeQuotes: false,
            removeEmptyAttributes: true,
            minifyCSS: true,
            minifyJS: true
        }
    },
    app: {
        resourcePath: '/app/', // where to load components/fragments from
        libraryPath: {
            '@lib': 'https://zuixjs.github.io/zkit/lib/',
            '@cdnjs': 'https://cdnjs.cloudflare.com/ajax/libs/'
        }
    }
};
