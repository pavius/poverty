(function () {
    'use strict';

    angular
        .module('poverty')
        .service('ResourceCacheService', ['$log', 'Restangular', ResourceCacheService]);

    function ResourceCacheService($log, Restangular) {

        var resourceCache = {
            suppliers: {state: 'invalid', resources: []},
            purchaseOrders: {state: 'invalid', resources: []},
            payments: {state: 'invalid', resources: []}
        };

        function invalidateAllCache() {
            _.forOwn(resourceCache, function(cache) {
                cache.state = 'invalid';
            });
        }

        return {

            invalidateCache: function (name) {
                invalidateAllCache()
            },

            loadResources: function (name, query) {

                if (resourceCache[name].state === 'invalid') {

                    resourceCache[name].state = 'inProgress';

                    Restangular.all(name).getList(query).then(function (resources) {
                        resourceCache[name].state = 'valid';
                        resourceCache[name].resources = resources;
                    });
                }
            },

            getResources: function (name) {
                return resourceCache[name].resources;
            }
        };
    }
})();
