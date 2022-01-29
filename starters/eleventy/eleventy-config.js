/**
 * @param eleventyConfig
 */
module.exports = function (eleventyConfig) {
    // TODO: add custom 11ty config here

    // # Add data collections

    // this is used by the searchFilter
    eleventyConfig.addCollection('posts_searchIndex', (collection) => {
        return [...collection.getFilteredByGlob('./source/pages/**/*.md')];
    });

    // # Add custom data filters

    eleventyConfig.addFilter(
        'search',
        require('./source/_filters/searchFilter')
    );
    eleventyConfig.addFilter(
        'startsWith',
        require('./source/_filters/startsWith')
    );
    eleventyConfig.addFilter(
        'dateFormat',
        require('./source/_filters/dateFormat')
    );

    // TODO: describe the following
    eleventyConfig.addPairedShortcode('unpre', function (content) {
        content = content.substring(content.indexOf('```') + 3);
        content = content.substring(content.indexOf('\n') + 1);
        content = content.substring(0, content.lastIndexOf('```'));
        return content.trim();
    });
};
