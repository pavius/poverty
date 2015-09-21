(function(){
  'use strict';

  angular
    .module('poverty')
    .service('ResourceCacheService', ['$log', ResourceCacheService]);

  function ResourceCacheService($log) {

    var resourceCache = {};

    return {

      setResources: function(name, resources) {
        resourceCache[name] = resources;
      },

      getResources: function(name) {
        return resourceCache[name];
      },

      getResourceById: function(name, id) {

        // could be asking for resources before they were added
        if (!resourceCache[name])
          return;

        for (var idx = 0; idx < resourceCache[name].length; ++idx)
          if (resourceCache[name][idx].id === id)
            return resourceCache[name][idx];
      }
    };
  }
})();
