'use strict';

/**
 * MdlButton class.
 *
 * @author Gene
 * @version 1.0.0 (2021-12-19)
 *
 * @constructor
 * @this {ContextController}
 */
function MdlButton() {
  this.create = () => {
    const view = this.view();
    const options = this.options();
    const type = options.type || 'raised';
    view.addClass('mdl-button mdl-js-button mdl-button--' + type + ' mdl-js-ripple-effect');
    if (options.class) {
      const classes = options.class.split(' ');
      if (classes.indexOf('mini-fab') !== -1) {
        classes.push('fab');
      }
      classes.forEach((c) => {
        view.addClass('mdl-button--' + c);
      });
    }
    // Upgrade MDL elements
    if (window['componentHandler']) {
      componentHandler.upgradeElements(view.get());
    }
  };
}
module.exports = MdlButton;
