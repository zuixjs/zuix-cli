/* globals zuix */
// componentId: '{{name}}'

/*
* Private static fields and functions
*/
// TODO: private static fields/methods declaration

/** @param cp {ContextController} */
module.exports = function(cp) {

    /*
     * Private fields
     */
    // TODO: private fields declaration


    /*
     * Life-cycle callbacks declaration
     */

    // called before component is loaded and before applying context options
    cp.init = function() {
        /* ... */
    };

    // called after loading, when the component is created
    cp.create = function() {
        /* ... */
        // public methods declaration
    };

    // called when the component is disposed
    cp.destroy = function() {
        /* ... */
    }

    // called each time the data model is updated
    cp.update = function(target, key, value, path, old) {
        /* ... */
    }


    /*
     * Private functions
     */
    // TODO: private methods implementation

};
